import 'server-only';
import { and, eq, inArray, isNotNull, isNull, or } from 'drizzle-orm';
import { AI_SCENES } from '@photobooth/catalog';
import { AiSceneSpecSchema, publicAiSpec, type AiSceneSpec, type AssetManifestResponse, type AssetRef, type FrameSpec, type ManifestTemplate, type TemplateFiles } from '@photobooth/contracts';
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

  // Uploaded templates, and built-in ones that carry files (the AI Studio scenes)
  const live = await db()
    .select()
    .from(catalogTemplates)
    // The platform's templates and this customer's own (never another customer's)
    .where(and(eq(catalogTemplates.status, 'published'), isNotNull(catalogTemplates.publishedVersion), or(isNull(catalogTemplates.orgId), eq(catalogTemplates.orgId, auth.org.id))));
  const versions = live.length ? await db().select().from(templateVersions).where(inArray(templateVersions.templateId, live.map((t) => t.id))) : [];

  const templates: ManifestTemplate[] = [];
  for (const t of live) {
    const v = versions.find((x) => x.kind === t.kind && x.templateId === t.id && x.version === t.publishedVersion);
    if (!v) continue;
    // An uploaded AI scene is drawn from its brief: without one the Admin could not make it
    if (t.kind === 'ai-scene' && t.source === 'uploaded' && !AiSceneSpecSchema.safeParse(v.spec).data?.brief) continue;
    const files: TemplateFiles = {};
    for (const [k, ref] of Object.entries(v.files) as [keyof TemplateFiles, AssetRef | undefined][]) {
      if (ref) files[k] = { ...ref, url: assetUrl(ref.url, origin) };
    }
    const builtin = t.source === 'builtin' ? AI_SCENES.find((x) => x.id === t.id) : undefined;
    templates.push({
      id: t.id,
      version: v.version,
      kind: t.kind,
      name: t.name ?? builtin?.name ?? t.id,
      desc: t.description ?? builtin?.desc ?? '',
      tags: t.tags ?? (builtin ? [builtin.category] : []),
      files,
      // AI scenes: menu facts only (the brief stays on the Admin)
      spec: t.kind === 'ai-scene' ? publicAiSpec(v.spec as Partial<AiSceneSpec>) : (v.spec as FrameSpec)
    });
  }
  return { revision, generatedAt: new Date().toISOString(), templates };
}
