import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { users } from '@/server/db/schema';
import { hashPassword, passwordProblem, verifyPassword } from '@/server/auth/password';
import { destroyAllSessions } from '@/server/auth/session';
import { AppError } from '@/server/lib/errors';
import { randomToken } from '@/server/lib/crypto';

const MAX_FAILED = 5;
const LOCK_MS = 15 * 60 * 1000;

// Verified against when the email is unknown, so response time doesn't reveal which emails exist
let dummyHash: Promise<string> | null = null;
const getDummyHash = () => (dummyHash ??= hashPassword(randomToken()));

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

/** Checks email + password with lockout after 5 failures. Returns the user id or throws. */
export async function authenticate(emailInput: string, password: string): Promise<string> {
  const email = normalizeEmail(emailInput);
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
    const failed = user.failedLogins + 1;
    await db()
      .update(users)
      .set(failed >= MAX_FAILED ? { failedLogins: 0, lockedUntil: new Date(now.getTime() + LOCK_MS) } : { failedLogins: failed })
      .where(eq(users.id, user.id));
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
