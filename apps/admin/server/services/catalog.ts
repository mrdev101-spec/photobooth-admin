import 'server-only';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { AiSceneSpec, FrameSpec, KioskSettings, TemplateFiles } from '@photobooth/contracts';
import { db } from '@/server/db/client';
import { catalogState, catalogTemplates, kioskConfigRevisions, kiosks, organizations, templateVersions, type CatalogTemplate, type TemplateVersion } from '@/server/db/schema';
import { assertCan, type OrgContext, type PlatformContext } from '@/server/auth/context';
import { audit } from '@/server/audit';
import { AppError } from '@/server/lib/errors';
import { BUILTIN_CATALOG, TEMPLATE_KINDS, catalogItems, visibleIds, withVisible, type CatalogItem, type CatalogState, type RetiredSet, type TemplateKind } from '@/lib/template-visibility';
import { assetPath } from './asset-store';
import { bumpAllKiosks, currentSettings, saveKioskConfig } from './kiosk-config';
import { listKiosks } from './kiosks';

// ─── Catalog state ──────────────────────────────────────────────────────────

/** The catalog card for an uploaded template version. */
export function uploadedItem(t: Pick<CatalogTemplate, 'kind' | 'id' | 'name' | 'description' | 'tags'> & { orgId?: string | null }, v: Pick<TemplateVersion, 'version' | 'spec' | 'files'> | null): CatalogItem {
  const files: TemplateFiles = v?.files ?? {};
  const path = (k: keyof TemplateFiles) => (files[k] ? assetPath(files[k]!.url) : undefined);
  const facts: NonNullable<CatalogItem['facts']> = [];
  if (v && t.kind !== 'ai-scene') {
    const spec = v.spec as FrameSpec;
    facts.push({ label: 'ขนาดไฟล์กรอบ', value: files.overlay?.width ? `${files.overlay.width} x ${files.overlay.height} px` : '-' });
    facts.push({ label: 'จำนวนช็อต', value: `${spec.photoSlots?.length ?? 0} ช็อต` });
    if (spec.textSlots?.length) facts.push({ label: 'ช่องข้อความ', value: `${spec.textSlots.length} ช่อง` });
  }
  if (v && t.kind === 'ai-scene') facts.push({ label: 'เพศของฉากต้นแบบ', value: { female: 'ผู้หญิง', male: 'ผู้ชาย', any: 'ทุกเพศ' }[(v.spec as AiSceneSpec).baseGender ?? 'any'] });
  if (t.tags?.length) facts.push({ label: 'แท็ก', value: t.tags.join(', ') });
  if (v) facts.push({ label: 'เวอร์ชัน', value: String(v.version) });
  const gallery = [
    path('preview') && { src: path('preview')!, label: 'ภาพตัวอย่าง' },
    path('sample') && { src: path('sample')!, label: 'ภาพตัวอย่างจากนักออกแบบ' },
    path('overlay') && { src: path('overlay')!, label: 'ไฟล์กรอบ (PNG)' },
    path('plate') && { src: path('plate')!, label: 'ฉากต้นแบบ' },
    path('female') && { src: path('female')!, label: 'ตัวอย่าง (ผู้หญิง)' },
    path('male') && { src: path('male')!, label: 'ตัวอย่าง (ผู้ชาย)' }
  ].filter((g): g is { src: string; label: string } => !!g);
  return {
    ...(t.orgId ? { ownerOrgId: t.orgId } : {}),
    kind: t.kind,
    id: t.id,
    name: t.name ?? t.id,
    desc: t.description ?? '',
    image: path('preview') ?? path('sample') ?? path('female') ?? path('plate') ?? path('overlay'),
    gallery,
    facts
  };
}

/**
 * Retired built-ins + published uploaded templates (at their published version). With `orgId`:
 * what that customer's kiosks may show (the platform's + its own); without: every template.
 */
export async function getCatalogState(orgId?: string): Promise<CatalogState> {
  const all = await db().select().from(catalogTemplates);
  const rows = orgId === undefined ? all : all.filter((r) => r.orgId === null || r.orgId === orgId);
  const retired: RetiredSet = {};
  for (const r of rows) if (r.source === 'builtin' && r.status === 'retired') (retired[r.kind] ??= new Set()).add(r.id);
  const live = rows.filter((r) => r.source === 'uploaded' && r.status === 'published' && r.publishedVersion);
  const versions = await versionsOf(live, 'published');
  return {
    retired,
    uploaded: live.map((t) => uploadedItem(t, versions.get(`${t.kind}:${t.id}`) ?? null)).sort((a, b) => a.name.localeCompare(b.name, 'th'))
  };
}

/** The published version of each template, or (`latest`) the published one else the newest. */
async function versionsOf(templates: CatalogTemplate[], pick: 'published' | 'latest'): Promise<Map<string, TemplateVersion>> {
  if (!templates.length) return new Map();
  const rows = await db().select().from(templateVersions).where(inArray(templateVersions.templateId, templates.map((t) => t.id)));
  const out = new Map<string, TemplateVersion>();
  for (const t of templates) {
    const mine = rows.filter((v) => v.kind === t.kind && v.templateId === t.id).sort((a, b) => b.version - a.version);
    const chosen = mine.find((v) => v.version === t.publishedVersion) ?? (pick === 'latest' ? mine[0] : undefined);
    if (chosen) out.set(`${t.kind}:${t.id}`, chosen);
  }
  return out;
}

export async function manifestRevision(): Promise<number> {
  return (await db().select({ r: catalogState.manifestRevision }).from(catalogState).where(eq(catalogState.id, 1)).limit(1))[0]?.r ?? 0;
}

/** The set of published uploaded templates changed: kiosks re-download the manifest. */
export async function bumpManifest(): Promise<number> {
  await db()
    .insert(catalogState)
    .values({ id: 1, manifestRevision: 1 })
    .onDuplicateKeyUpdate({ set: { manifestRevision: sql`${catalogState.manifestRevision} + 1` } });
  return manifestRevision();
}

// ─── Platform ───────────────────────────────────────────────────────────────

type Status = 'draft' | 'published' | 'retired';
export type PlatformCatalogItem = CatalogItem & { source: 'builtin' | 'uploaded'; status: Status; kiosks: number };

async function liveKioskTemplates() {
  return db()
    .select({ kioskRowId: kiosks.id, kioskName: kiosks.name, kioskStatus: kiosks.status, orgId: organizations.id, orgName: organizations.name, settings: kioskConfigRevisions.settings })
    .from(kiosks)
    .innerJoin(kioskConfigRevisions, and(eq(kioskConfigRevisions.kioskRowId, kiosks.id), eq(kioskConfigRevisions.revision, kiosks.currentRevision)))
    .innerJoin(organizations, eq(organizations.id, kiosks.orgId))
    .where(and(inArray(kiosks.status, ['active', 'disabled', 'pending']), isNull(organizations.deletedAt)));
}

/** Every template (built-in and uploaded, drafts included) with its status and how many kiosks show it. */
export async function platformCatalog(): Promise<{ kiosksTotal: number; items: PlatformCatalogItem[] }> {
  const state = await getCatalogState();
  const rows = await liveKioskTemplates();
  const usage = new Map<string, number>();
  for (const r of rows) {
    const t = (r.settings as KioskSettings).templates;
    for (const { kind } of TEMPLATE_KINDS) for (const id of visibleIds(t, kind, state)) usage.set(`${kind}:${id}`, (usage.get(`${kind}:${id}`) ?? 0) + 1);
  }
  const uploadedRows = await db().select().from(catalogTemplates).where(eq(catalogTemplates.source, 'uploaded')).orderBy(asc(catalogTemplates.name));
  const latest = await versionsOf(uploadedRows, 'latest');
  const uploaded: PlatformCatalogItem[] = uploadedRows.map((t) => ({
    ...uploadedItem(t, latest.get(`${t.kind}:${t.id}`) ?? null),
    source: 'uploaded' as const,
    status: t.status,
    kiosks: t.status === 'published' ? (usage.get(`${t.kind}:${t.id}`) ?? 0) : 0
  }));
  return {
    kiosksTotal: rows.length,
    items: [
      ...BUILTIN_CATALOG.map((c) => ({ ...c, source: 'builtin' as const, status: state.retired[c.kind]?.has(c.id) ? ('retired' as const) : ('published' as const), kiosks: usage.get(`${c.kind}:${c.id}`) ?? 0 })),
      ...uploaded
    ]
  };
}

/** One template with its status, versions, and every kiosk (across customers) whose settings show it. */
export async function templateDetail(kind: TemplateKind, id: string) {
  const builtin = BUILTIN_CATALOG.find((c) => c.kind === kind && c.id === id);
  const row = (await db().select().from(catalogTemplates).where(and(eq(catalogTemplates.kind, kind), eq(catalogTemplates.id, id))).limit(1))[0];
  if (!builtin && row?.source !== 'uploaded') return null;
  const versions = builtin ? [] : await db().select().from(templateVersions).where(and(eq(templateVersions.kind, kind), eq(templateVersions.templateId, id))).orderBy(asc(templateVersions.version));
  const status: Status = row?.status ?? 'published';
  const shownVersion = builtin ? null : (versions.find((v) => v.version === row!.publishedVersion) ?? versions.at(-1) ?? null);
  const item: CatalogItem = builtin ?? uploadedItem(row!, shownVersion);
  // Count as if the template were live, so the platform sees who retiring affects
  const state = await getCatalogState();
  const asLive: CatalogState = builtin
    ? { ...state, retired: { ...state.retired, [kind]: new Set([...(state.retired[kind] ?? [])].filter((x) => x !== id)) } }
    : { ...state, uploaded: [...state.uploaded.filter((u) => u.id !== id), item] };
  const rows = await liveKioskTemplates();
  const showing = status === 'draft' ? [] : rows.filter((r) => visibleIds((r.settings as KioskSettings).templates, kind, asLive).includes(id));
  return {
    item: { ...item, source: builtin ? ('builtin' as const) : ('uploaded' as const), status },
    template: row ?? null,
    versions,
    kiosksTotal: rows.length,
    kiosks: showing.map(({ settings: _s, ...r }) => r).sort((a, b) => a.orgName.localeCompare(b.orgName, 'th') || a.kioskName.localeCompare(b.kioskName, 'th'))
  };
}

export async function bumpEveryKiosk(userId: string, note: string): Promise<number> {
  const orgs = await db().select({ id: organizations.id }).from(organizations).where(isNull(organizations.deletedAt));
  let bumped = 0;
  for (const o of orgs) bumped += await bumpAllKiosks(o.id, userId, note);
  return bumped;
}

/**
 * Retires or re-publishes a template for everyone. Every kiosk gets a new config revision so
 * the change reaches the booths (retired templates are stripped from what kiosks receive).
 * Uploaded templates also leave / rejoin the asset manifest.
 */
export async function setTemplateStatus(ctx: PlatformContext, kind: TemplateKind, id: string, status: 'published' | 'retired') {
  const builtin = BUILTIN_CATALOG.some((c) => c.kind === kind && c.id === id);
  const row = (await db().select().from(catalogTemplates).where(and(eq(catalogTemplates.kind, kind), eq(catalogTemplates.id, id))).limit(1))[0];
  if (!builtin && row?.source !== 'uploaded') throw new AppError('ไม่พบ template');
  if (!builtin && !row?.publishedVersion) throw new AppError('template นี้ยังไม่เคยเผยแพร่ ให้เผยแพร่จากหน้าแก้ไข');
  if (status === 'retired') {
    const left = catalogItems(kind, await getCatalogState()).filter((c) => c.id !== id);
    if (!left.length) throw new AppError('ต้องเหลือ template ที่ใช้งานอย่างน้อย 1 แบบในหมวดนี้');
  }
  if (builtin) {
    await db()
      .insert(catalogTemplates)
      .values({ kind, id, source: 'builtin', status, updatedBy: ctx.user.id })
      .onDuplicateKeyUpdate({ set: { status, updatedBy: ctx.user.id, updatedAt: sql`CURRENT_TIMESTAMP(3)` } });
  } else {
    await db().update(catalogTemplates).set({ status, updatedBy: ctx.user.id }).where(and(eq(catalogTemplates.kind, kind), eq(catalogTemplates.id, id)));
    await bumpManifest();
  }
  const bumped = await bumpEveryKiosk(ctx.user.id, status === 'retired' ? `ส่วนกลางเลิกใช้ template ${id}` : `ส่วนกลางเปิดใช้ template ${id}`);
  await audit({ user: ctx.user, orgId: null }, { action: status === 'retired' ? 'template.retire' : 'template.publish', resourceType: 'template', resourceId: `${kind}:${id}`, after: { kiosksUpdated: bumped } });
  return bumped;
}

// ─── Customer (show / hide only) ────────────────────────────────────────────

/** The gallery for one kiosk: every published template and whether this kiosk shows it. */
export async function kioskGallery(ctx: OrgContext, kioskRowId: string) {
  assertCan(ctx, 'kiosk.view');
  const state = await getCatalogState(ctx.org.id);
  const kiosk = (await listKiosks(ctx)).find((k) => k.kiosk.id === kioskRowId)?.kiosk;
  if (!kiosk) throw new AppError('ไม่พบตู้', 'not_found');
  const current = await currentSettings(kiosk);
  if (!current) throw new AppError('ตู้นี้ยังไม่เคยจับคู่ จึงยังไม่มีการตั้งค่า');
  return {
    kiosk,
    revision: current.revision,
    /** Uploaded templates reach this kiosk only once it downloads the asset manifest. */
    supportsUploaded: kiosk.manifestRevision != null,
    kinds: TEMPLATE_KINDS.map(({ kind, label, desc }) => {
      const shown = new Set(visibleIds(current.settings.templates, kind, state));
      return { kind, label, desc, items: catalogItems(kind, state).map((c) => ({ ...c, uploaded: !BUILTIN_CATALOG.includes(c), shown: shown.has(c.id) })) };
    })
  };
}

/**
 * Shows exactly `ids` for `kind` on each target kiosk (one new revision per kiosk). Uses the
 * normal settings save, so the customer's "templates" permission and concurrency apply.
 */
export async function saveTemplateVisibility(ctx: OrgContext, kioskRowIds: string[], kind: TemplateKind, ids: string[]) {
  assertCan(ctx, 'config.edit');
  const state = await getCatalogState(ctx.org.id);
  const mine = await listKiosks(ctx);
  const targets = mine.filter((k) => kioskRowIds.includes(k.kiosk.id) && k.kiosk.currentRevision > 0 && k.kiosk.status !== 'revoked');
  if (!targets.length) throw new AppError('ไม่มีตู้ที่บันทึกได้');
  let changed = 0;
  for (const { kiosk } of targets) {
    const current = await currentSettings(kiosk);
    if (!current) continue;
    let templates: KioskSettings['templates'];
    try {
      templates = withVisible(current.settings.templates, kind, ids, state);
    } catch (err) {
      throw new AppError((err as Error).message);
    }
    const { adminPin: _pin, ...editable } = current.settings;
    const r = await saveKioskConfig(ctx, kiosk.id, { baseRevision: current.revision, settings: { ...editable, templates }, pin: { action: 'keep' }, note: 'เลือก template ที่แสดง' });
    if (r.changed) changed++;
  }
  return { kiosks: targets.length, changed };
}
