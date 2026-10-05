/**
 * One-time (and repeatable) import of the built-in AI Studio scenes into the central catalog:
 * the kiosk's `data/ai-scenes/<id>.jpg` (plate, the scene without a person), `<id>-female.jpg`
 * and `<id>-male.jpg` become a published version of each built-in `ai-scene`, so kiosks get
 * them from the Admin (asset manifest) instead of the installer. Unchanged files are skipped.
 *
 *   npx tsx --import ./scripts/allow-server-only.mjs --env-file-if-exists=.env.local scripts/import-ai-scenes.ts <folder>
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { AI_SCENES } from '@photobooth/catalog';
import type { AiSceneSpec, TemplateFiles } from '@photobooth/contracts';
import { db } from '../server/db/client';
import { catalogTemplates, templateVersions, users } from '../server/db/schema';
import { putAsset } from '../server/services/asset-store';
import { bumpManifest } from '../server/services/catalog';
import { newId } from '../server/lib/ids';

const ROLES = { plate: '', female: '-female', male: '-male' } as const;

function contentType(bytes: Buffer): 'image/png' | 'image/jpeg' | null {
  if (bytes[0] === 0x89 && bytes.slice(1, 4).toString() === 'PNG') return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  return null;
}

async function main() {
  const folder = process.argv[2];
  if (!folder || !existsSync(folder)) throw new Error('Usage: import-ai-scenes.ts <kiosk data/ai-scenes folder>');
  const admin = (await db().select({ id: users.id }).from(users).where(isNotNull(users.platformRole)).limit(1))[0];
  if (!admin) throw new Error('No platform admin user');
  let imported = 0;
  let unchanged = 0;
  const missing: string[] = [];

  for (const scene of AI_SCENES) {
    const files: TemplateFiles = {};
    const shas: string[] = [];
    let complete = true;
    for (const [role, suffix] of Object.entries(ROLES) as [keyof typeof ROLES, string][]) {
      const file = join(folder, `${scene.id}${suffix}.jpg`);
      if (!existsSync(file)) { complete = false; break; }
      const bytes = readFileSync(file);
      const type = contentType(bytes);
      if (!type) { complete = false; break; }
      shas.push(createHash('sha256').update(bytes).digest('hex'));
      files[role] = await putAsset(new Uint8Array(bytes), type, { userId: admin.id });
    }
    if (!complete) { missing.push(scene.id); continue; }

    const latest = (await db().select().from(templateVersions).where(and(eq(templateVersions.kind, 'ai-scene'), eq(templateVersions.templateId, scene.id))).orderBy(desc(templateVersions.version)).limit(1))[0];
    const same = latest && (['plate', 'female', 'male'] as const).every((r, i) => latest.files[r]?.sha256 === shas[i]);
    if (same) { unchanged++; continue; }

    const version = (latest?.version ?? 0) + 1;
    const now = new Date();
    // The generation prompt stays in the kiosk (aiStudio.cjs) until AI calls move to the Admin
    const spec: AiSceneSpec = { prompt: `Built-in scene "${scene.name}": the generation prompt is kept by the kiosk for now.`, baseGender: 'any', accent: '#C8102E' };
    await db().insert(templateVersions).values({ id: newId('tpv'), kind: 'ai-scene', templateId: scene.id, version, spec, files, note: 'นำเข้าภาพฉากในตัวจากตู้', createdBy: admin.id, publishedAt: now });
    await db()
      .insert(catalogTemplates)
      .values({ id: scene.id, kind: 'ai-scene', source: 'builtin', status: 'published', publishedVersion: version, createdBy: admin.id, createdAt: now, updatedBy: admin.id })
      .onDuplicateKeyUpdate({ set: { publishedVersion: version, status: 'published', updatedBy: admin.id } });
    imported++;
  }
  if (imported) await bumpManifest();
  console.log(`AI scenes: ${imported} imported, ${unchanged} unchanged${missing.length ? `, missing files: ${missing.join(', ')}` : ''}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
