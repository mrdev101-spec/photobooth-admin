import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import type { AssetManifestResponse, AssetRef, ManifestTemplate, TemplateFiles } from '@photobooth/contracts';
import { db } from '@/server/db/client';
import { catalogTemplates, kiosks, templateVersions } from '@/server/db/schema';
import { assetUrl } from '@/server/services/asset-store';
import { manifestRevision } from '@/server/services/catalog';
import type { KioskAuth } from './auth';

/**
 * GET /kiosk/assets/manifest?since={rev}: every published uploaded template with its files
 * (absolute URLs + sha256). `null` = 304. Calling it marks the kiosk as able to draw uploaded
 * templates, so from then on its config may list `tpl_` ids.
 */
export async function assetManifest(auth: KioskAuth, since: number | null, origin: string): Promise<AssetManifestResponse | null> {
  const revision = await manifestRevision();
  if (auth.kiosk.manifestRevision !== revision) {
    await db().update(kiosks).set({ manifestRevision: revision }).where(eq(kiosks.id, auth.kiosk.id));
  }
  if (since != null && since >= revision) return null;

  const live = await db()
    .select()
    .from(catalogTemplates)
    .where(and(eq(catalogTemplates.source, 'uploaded'), eq(catalogTemplates.status, 'published')));
  const versions = live.length ? await db().select().from(templateVersions).where(inArray(templateVersions.templateId, live.map((t) => t.id))) : [];

  const templates: ManifestTemplate[] = [];
  for (const t of live) {
    const v = versions.find((x) => x.kind === t.kind && x.templateId === t.id && x.version === t.publishedVersion);
    if (!v) continue;
    const files: TemplateFiles = {};
    for (const [k, ref] of Object.entries(v.files) as [keyof TemplateFiles, AssetRef | undefined][]) {
      if (ref) files[k] = { ...ref, url: assetUrl(ref.url, origin) };
    }
    templates.push({ id: t.id, version: v.version, kind: t.kind, name: t.name ?? t.id, desc: t.description ?? '', tags: t.tags ?? [], files, spec: v.spec });
  }
  return { revision, generatedAt: new Date().toISOString(), templates };
}
