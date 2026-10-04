/**
 * Local/dev helper: issues an extra device token for a paired kiosk so the kiosk API can be
 * exercised with curl without a real booth. Writes the token to OUT_FILE; never prints it.
 *   OUT_FILE=… npx tsx --env-file-if-exists=.env.local scripts/dev-kiosk-token.ts <orgSlug> [kiosk name]
 */
import { writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import { db } from '../server/db/client';
import { kioskTokens, kiosks, organizations } from '../server/db/schema';
import { sha256Hex } from '../server/lib/crypto';
import { newId } from '../server/lib/ids';

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Dev only');
  const slug = process.argv[2];
  const out = process.env.OUT_FILE;
  if (!slug || !out) throw new Error('Usage: OUT_FILE=… dev-kiosk-token.ts <orgSlug>');
  const row = (
    await db()
      .select({ kiosk: kiosks })
      .from(kiosks)
      .innerJoin(organizations, eq(organizations.id, kiosks.orgId))
      .where(and(eq(organizations.slug, slug), eq(kiosks.status, 'active'), gt(kiosks.currentRevision, 0), process.argv[3] ? eq(kiosks.name, process.argv[3]) : undefined))
      .limit(1)
  )[0];
  if (!row) throw new Error(`No active kiosk in ${slug}`);
  const token = randomBytes(32).toString('base64url');
  await db().insert(kioskTokens).values({ id: newId('ktk'), orgId: row.kiosk.orgId, kioskRowId: row.kiosk.id, tokenHash: sha256Hex(token) });
  writeFileSync(out, JSON.stringify({ token, kioskId: row.kiosk.kioskId, kioskRowId: row.kiosk.id, name: row.kiosk.name }));
  console.log(`Token for ${row.kiosk.name} (${row.kiosk.kioskId}) written to ${out}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
