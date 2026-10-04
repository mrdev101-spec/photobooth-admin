/**
 * Local/dev helper: sets a user's password without the UI (e.g. a test account whose
 * one-time password was lost). Reads the new password from NEW_PASSWORD; never prints it.
 *   NEW_PASSWORD=… npx tsx --env-file-if-exists=.env.local scripts/set-password.ts user@example.com
 */
import { eq } from 'drizzle-orm';
import { db } from '../server/db/client';
import { userSessions, users } from '../server/db/schema';
import { hashPassword, passwordProblem } from '../server/auth/password';

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  const password = process.env.NEW_PASSWORD ?? '';
  if (!email) throw new Error('Usage: set-password.ts <email>  (password in NEW_PASSWORD)');
  const problem = passwordProblem(password, email);
  if (problem) throw new Error(`NEW_PASSWORD: ${problem}`);
  const user = (await db().select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1))[0];
  if (!user) throw new Error(`No user ${email}`);
  await db()
    .update(users)
    .set({ passwordHash: await hashPassword(password), mustChangePassword: false, failedLogins: 0, lockedUntil: null })
    .where(eq(users.id, user.id));
  await db().delete(userSessions).where(eq(userSessions.userId, user.id));
  console.log(`Password updated for ${email} (all sessions signed out).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
