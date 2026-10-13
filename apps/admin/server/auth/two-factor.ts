import 'server-only';
import { randomInt, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { and, eq, gt, sql } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { loginChallenges, memberships, trustedDevices, users } from '@/server/db/schema';
import { newId } from '@/server/lib/ids';
import { randomToken, sha256Hex } from '@/server/lib/crypto';
import { AppError } from '@/server/lib/errors';
import { rateLimit } from '@/server/lib/rate-limit';
import { sendEmail } from '@/server/lib/email';
import { requestMeta } from './session';

/**
 * Email 2FA (decided 2026-10-13): the platform team and shop owners confirm a new browser with a
 * 6-digit code sent to their email. The browser can be remembered for 30 days.
 */
const CHALLENGE_COOKIE = 'pb_2fa';
const TRUST_COOKIE = 'pb_td';
const CODE_TTL_MS = 10 * 60 * 1000;
const TRUST_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_SENDS = 4;
const cookieBase = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/' };

const codeHash = (challengeId: string, code: string) => sha256Hex(`${challengeId}:${code}`);
const sameHash = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const newCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0');

/** Platform team and shop owners must confirm new browsers by email. */
export async function requiresTwoFactor(userId: string): Promise<boolean> {
  const u = (await db().select({ platformRole: users.platformRole }).from(users).where(eq(users.id, userId)).limit(1))[0];
  if (u?.platformRole) return true;
  const owner = (await db().select({ role: memberships.role }).from(memberships).where(and(eq(memberships.userId, userId), eq(memberships.role, 'owner'))).limit(1))[0];
  return !!owner;
}

/** This browser was remembered by this user (and has not expired). */
export async function isTrustedDevice(userId: string): Promise<boolean> {
  const token = (await cookies()).get(TRUST_COOKIE)?.value;
  if (!token) return false;
  const row = (
    await db()
      .select({ id: trustedDevices.id })
      .from(trustedDevices)
      .where(and(eq(trustedDevices.tokenHash, sha256Hex(token)), eq(trustedDevices.userId, userId), gt(trustedDevices.expiresAt, new Date())))
      .limit(1)
  )[0];
  return !!row;
}

const escapeHtml = (s: string) => s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c] ?? c);

async function emailCode(userId: string, code: string) {
  const u = (await db().select({ email: users.email, name: users.name }).from(users).where(eq(users.id, userId)).limit(1))[0];
  if (!u) throw new AppError('ไม่พบผู้ใช้', 'unauthenticated');
  await sendEmail({
    to: u.email,
    subject: `รหัสเข้าสู่ระบบ ${code}`,
    text: `สวัสดี ${u.name}\n\nรหัสยืนยันการเข้าสู่ระบบของคุณคือ ${code}\nรหัสนี้ใช้ได้ 10 นาที ถ้าคุณไม่ได้พยายามเข้าสู่ระบบ ให้เปลี่ยนรหัสผ่านทันที\n\nSCLUO-DIO Photobooth Admin`,
    html:
      `<p>สวัสดี ${escapeHtml(u.name)}</p><p>รหัสยืนยันการเข้าสู่ระบบของคุณคือ</p>` +
      `<p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p>` +
      `<p>รหัสนี้ใช้ได้ 10 นาที ถ้าคุณไม่ได้พยายามเข้าสู่ระบบ ให้เปลี่ยนรหัสผ่านทันที</p>`
  });
}

/** The password was right: send a code and keep the attempt in a short-lived cookie. */
export async function startChallenge(userId: string): Promise<void> {
  if (!(await rateLimit(`2fa:start:${userId}`, 6, 900))) throw new AppError('ขอรหัสบ่อยเกินไป กรุณารอ 15 นาที', 'unauthenticated');
  const id = newId('lch');
  const token = randomToken();
  const code = newCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);
  await db().delete(loginChallenges).where(eq(loginChallenges.userId, userId)); // one open sign-in per user
  await db().insert(loginChallenges).values({ id, tokenHash: sha256Hex(token), userId, codeHash: codeHash(id, code), expiresAt });
  await emailCode(userId, code);
  (await cookies()).set(CHALLENGE_COOKIE, token, { ...cookieBase, expires: expiresAt });
}

async function currentChallenge() {
  const token = (await cookies()).get(CHALLENGE_COOKIE)?.value;
  if (!token) return null;
  return (await db().select().from(loginChallenges).where(and(eq(loginChallenges.tokenHash, sha256Hex(token)), gt(loginChallenges.expiresAt, new Date()))).limit(1))[0] ?? null;
}

/** For the verify page: the (masked) email the code went to, or null without an open sign-in. */
export async function pendingChallengeEmail(): Promise<string | null> {
  const ch = await currentChallenge();
  if (!ch) return null;
  const u = (await db().select({ email: users.email }).from(users).where(eq(users.id, ch.userId)).limit(1))[0];
  if (!u) return null;
  const at = u.email.indexOf('@');
  const name = u.email.slice(0, at);
  return `${name.slice(0, 2)}${'*'.repeat(Math.max(1, name.length - 2))}${u.email.slice(at)}`;
}

/** Checks the code. Right: returns the user id (the caller creates the session). */
export async function verifyChallenge(code: string, remember: boolean): Promise<string> {
  const ch = await currentChallenge();
  if (!ch) throw new AppError('รหัสหมดอายุแล้ว กรุณาเข้าสู่ระบบใหม่', 'unauthenticated');
  if (ch.attempts >= MAX_ATTEMPTS) throw new AppError('กรอกรหัสผิดหลายครั้ง กรุณาเข้าสู่ระบบใหม่', 'unauthenticated');
  if (!/^\d{6}$/.test(code) || !sameHash(codeHash(ch.id, code), ch.codeHash)) {
    await db().update(loginChallenges).set({ attempts: sql`${loginChallenges.attempts} + 1` }).where(eq(loginChallenges.id, ch.id));
    throw new AppError(`รหัสไม่ถูกต้อง (เหลือ ${Math.max(0, MAX_ATTEMPTS - ch.attempts - 1)} ครั้ง)`);
  }
  await db().delete(loginChallenges).where(eq(loginChallenges.id, ch.id));
  const jar = await cookies();
  jar.delete(CHALLENGE_COOKIE);
  if (remember) {
    const token = randomToken();
    const expiresAt = new Date(Date.now() + TRUST_TTL_MS);
    await db().insert(trustedDevices).values({ id: newId('tdv'), tokenHash: sha256Hex(token), userId: ch.userId, userAgent: (await requestMeta()).userAgent, expiresAt });
    jar.set(TRUST_COOKIE, token, { ...cookieBase, expires: expiresAt });
  }
  return ch.userId;
}

/** A new code for the same sign-in (a few times at most). */
export async function resendChallenge(): Promise<void> {
  const ch = await currentChallenge();
  if (!ch) throw new AppError('รหัสหมดอายุแล้ว กรุณาเข้าสู่ระบบใหม่', 'unauthenticated');
  if (ch.sentCount >= MAX_SENDS) throw new AppError('ส่งรหัสครบจำนวนแล้ว กรุณาเข้าสู่ระบบใหม่ภายหลัง');
  const code = newCode();
  await db()
    .update(loginChallenges)
    .set({ codeHash: codeHash(ch.id, code), sentCount: ch.sentCount + 1, expiresAt: new Date(Date.now() + CODE_TTL_MS) })
    .where(eq(loginChallenges.id, ch.id));
  await emailCode(ch.userId, code);
}
