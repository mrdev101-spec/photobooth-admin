import 'server-only';
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { and, eq, gt } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { userSessions, users, type User } from '@/server/db/schema';
import { newId } from '@/server/lib/ids';
import { randomToken, sha256Hex } from '@/server/lib/crypto';

/**
 * Session module (design decision D11): random cookie token, only its sha256 is stored.
 * 12 hour lifetime, no sliding renewal, so a stolen cookie has a bounded life.
 */

export const SESSION_COOKIE = 'pb_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const TOUCH_EVERY_MS = 5 * 60 * 1000;

export type SessionUser = Pick<User, 'id' | 'email' | 'name' | 'platformRole' | 'mustChangePassword'>;

export async function requestMeta(): Promise<{ ip: string | null; userAgent: string | null }> {
  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || null;
  return { ip, userAgent: h.get('user-agent')?.slice(0, 255) ?? null };
}

export async function createSession(userId: string): Promise<void> {
  const token = randomToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  const meta = await requestMeta();
  await db().insert(userSessions).values({
    id: newId('ses'),
    tokenHash: sha256Hex(token),
    userId,
    ip: meta.ip,
    userAgent: meta.userAgent,
    expiresAt,
    lastSeenAt: now
  });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt
  });
}

/** Current signed-in user, or null. Cached per request. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const now = new Date();
  const rows = await db()
    .select({
      sessionId: userSessions.id,
      lastSeenAt: userSessions.lastSeenAt,
      id: users.id,
      email: users.email,
      name: users.name,
      platformRole: users.platformRole,
      mustChangePassword: users.mustChangePassword
    })
    .from(userSessions)
    .innerJoin(users, eq(users.id, userSessions.userId))
    .where(and(eq(userSessions.tokenHash, sha256Hex(token)), gt(userSessions.expiresAt, now), eq(users.isActive, true)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (now.getTime() - row.lastSeenAt.getTime() > TOUCH_EVERY_MS) {
    await db().update(userSessions).set({ lastSeenAt: now }).where(eq(userSessions.id, row.sessionId));
  }
  const { sessionId: _s, lastSeenAt: _l, ...user } = row;
  return user;
});

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db().delete(userSessions).where(eq(userSessions.tokenHash, sha256Hex(token)));
  jar.delete(SESSION_COOKIE);
}

/** Signs a user out everywhere (password change / reset / deactivation). */
export async function destroyAllSessions(userId: string): Promise<void> {
  await db().delete(userSessions).where(eq(userSessions.userId, userId));
}
