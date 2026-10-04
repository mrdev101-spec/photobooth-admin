/**
 * Creates (or promotes) the first platform admin. Run once after `npm run db:migrate`:
 *   SEED_ADMIN_EMAIL=… SEED_ADMIN_NAME=… SEED_ADMIN_PASSWORD=… npm run db:seed
 * (or put them in apps/admin/.env.local). The password is never printed.
 */
import { eq } from 'drizzle-orm';
import { db } from '../server/db/client';
import { users } from '../server/db/schema';
import { hashPassword, passwordProblem } from '../server/auth/password';
import { newId } from '../server/lib/ids';

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const name = process.env.SEED_ADMIN_NAME?.trim() || 'Platform Admin';
  const password = process.env.SEED_ADMIN_PASSWORD ?? '';
  if (!email) throw new Error('Set SEED_ADMIN_EMAIL');
  const problem = passwordProblem(password, email);
  if (problem) throw new Error(`SEED_ADMIN_PASSWORD: ${problem}`);

  const existing = (await db().select().from(users).where(eq(users.email, email)).limit(1))[0];
  if (existing) {
    await db().update(users).set({ platformRole: 'platform_admin', isActive: true }).where(eq(users.id, existing.id));
    console.log(`Promoted ${email} to platform_admin (password unchanged).`);
  } else {
    await db()
      .insert(users)
      .values({ id: newId('usr'), email, name, passwordHash: await hashPassword(password), platformRole: 'platform_admin', mustChangePassword: false });
    console.log(`Created platform_admin ${email}.`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
