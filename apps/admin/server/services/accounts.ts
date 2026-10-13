import 'server-only';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { users } from '@/server/db/schema';
import { hashPassword, passwordProblem, verifyPassword } from '@/server/auth/password';
import { destroyAllSessions } from '@/server/auth/session';
import { AppError } from '@/server/lib/errors';
import { randomToken } from '@/server/lib/crypto';
import { rateLimit } from '@/server/lib/rate-limit';

const MAX_FAILED = 5;
const LOCK_MS = 15 * 60 * 1000;

// Verified against when the email is unknown, so response time doesn't reveal which emails exist
let dummyHash: Promise<string> | null = null;
const getDummyHash = () => (dummyHash ??= hashPassword(randomToken()));

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

/**
 * Checks email + password with lockout after 5 failures. Returns the user id or throws.
 * Before any password work: at most 20 tries per IP and 10 per email in 15 minutes, so
 * password spraying and login floods (argon2 is costly) are cut off early.
 */
export async function authenticate(emailInput: string, password: string, ip: string | null = null): Promise<string> {
  const email = normalizeEmail(emailInput);
  const tooMany = new AppError('ลองเข้าสู่ระบบหลายครั้งเกินไป กรุณารอ 15 นาทีแล้วลองใหม่', 'unauthenticated');
  if (ip && !(await rateLimit(`login:ip:${ip}`, 20, 900))) throw tooMany;
  if (!(await rateLimit(`login:email:${email}`, 10, 900))) throw tooMany;
  const user = (await db().select().from(users).where(eq(users.email, email)).limit(1))[0];
  const invalid = new AppError('อีเมลหรือรหัสผ่านไม่ถูกต้อง', 'unauthenticated');

  if (!user || !user.isActive) {
    await verifyPassword(await getDummyHash(), password);
    throw invalid;
  }
  const now = new Date();
  if (user.lockedUntil && user.lockedUntil > now) {
    throw new AppError('บัญชีถูกล็อกชั่วคราวเพราะใส่รหัสผ่านผิดหลายครั้ง ลองใหม่ภายหลัง 15 นาที', 'unauthenticated');
  }
  if (!(await verifyPassword(user.passwordHash, password))) {
    // Counted in the database itself, so guesses sent in parallel cannot slip past the lock
    await db().update(users).set({ failedLogins: sql`${users.failedLogins} + 1` }).where(eq(users.id, user.id));
    const after = (await db().select({ failed: users.failedLogins }).from(users).where(eq(users.id, user.id)).limit(1))[0];
    if ((after?.failed ?? 0) >= MAX_FAILED) await db().update(users).set({ failedLogins: 0, lockedUntil: new Date(now.getTime() + LOCK_MS) }).where(eq(users.id, user.id));
    throw invalid;
  }
  await db().update(users).set({ failedLogins: 0, lockedUntil: null, lastLoginAt: now }).where(eq(users.id, user.id));
  return user.id;
}

export async function changeOwnPassword(userId: string, current: string, next: string): Promise<void> {
  const user = (await db().select().from(users).where(eq(users.id, userId)).limit(1))[0];
  if (!user) throw new AppError('ไม่พบผู้ใช้', 'not_found');
  if (!(await verifyPassword(user.passwordHash, current))) throw new AppError('รหัสผ่านปัจจุบันไม่ถูกต้อง');
  if (current === next) throw new AppError('รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม');
  const problem = passwordProblem(next, user.email);
  if (problem) throw new AppError(problem);
  await db()
    .update(users)
    .set({ passwordHash: await hashPassword(next), mustChangePassword: false })
    .where(eq(users.id, userId));
  await destroyAllSessions(userId);
}
