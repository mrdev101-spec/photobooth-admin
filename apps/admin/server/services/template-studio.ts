import 'server-only';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  AiSceneSpecSchema,
  FrameSpecSchema,
  MAX_IMAGE_BYTES,
  MAX_OVERLAY_BYTES,
  TEMPLATE_CANVAS,
  UPLOADED_ID_PATTERN,
  frameIssues,
  overlaySizeIssue,
  type AiSceneSpec,
  type FrameSpec,
  type TemplateFiles,
  type TemplateSpec,
  type UploadedTemplateKind
} from '@photobooth/contracts';
import { db } from '@/server/db/client';
import { catalogTemplates, organizations, templateVersions, type TemplateVersion } from '@/server/db/schema';
import type { SessionUser } from '@/server/auth/session';
import { randomCode } from '@/server/lib/crypto';
import { audit } from '@/server/audit';
import { AppError, isDuplicateKey } from '@/server/lib/errors';
import { newId } from '@/server/lib/ids';
import { imageInfo } from '@/server/lib/image-info';
import { BUILTIN_CATALOG } from '@/lib/template-visibility';
import { putAsset } from './asset-store';
import { bumpEveryKiosk, bumpManifest } from './catalog';
import { bumpAllKiosks } from './kiosk-config';

/**
 * Central template studio (platform only): create an uploaded template, edit drafts, upload
 * its files, publish a version, roll back. A published version is immutable; editing creates
 * the next version as a draft.
 */

type FrameKind = Exclude<UploadedTemplateKind, 'ai-scene'>;

/**
 * Who edits: the platform team (orgId null: every template) or a customer (orgId: only the
 * templates it uploaded, frames only, within its template quota; its kiosks only).
 */
export interface StudioActor {
  user: SessionUser;
  orgId?: string | null;
  actingAsPlatform?: boolean;
}
const scopeOf = (ctx: StudioActor) => ctx.orgId ?? null;
const auditActor = (ctx: StudioActor) => ({ user: ctx.user, orgId: scopeOf(ctx), actingAsPlatform: ctx.actingAsPlatform });
/** Kinds a customer may upload itself. */
export const SHOP_TEMPLATE_KINDS = ['photo-4x6', 'badge'] as const;
export type FileSlot = keyof TemplateFiles;

export const NewTemplateInput = z.object({
  kind: z.enum(['photo-4x6', 'badge', 'classic', 'ai-scene']),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9_-]{1,40}$/, 'รหัสใช้ a-z 0-9 _ - (2-41 ตัว)'),
  name: z.string().trim().min(2, 'ชื่อสั้นเกินไป').max(80),
  description: z.string().trim().max(300).default(''),
  tags: z
    .string()
    .default('')
    .transform((v) => [...new Set(v.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 8)),
  /** Platform only: a template for one customer (only its kiosks get it; not on its quota). */
  forOrgId: z
    .string()
    .trim()
    .max(32)
    .default('')
    .transform((v) => v || null)
});

export const TemplateInfoInput = NewTemplateInput.pick({ name: true, description: true, tags: true });

/** Kinds that count against a customer's template quota (the platform's AI scenes for it don't). */
const quotaKinds = <T extends { kind: string }>(rows: T[]): T[] => rows.filter((r) => (SHOP_TEMPLATE_KINDS as readonly string[]).includes(r.kind));

/** Starting point for a new frame: one photo window inside the safe area. */
export function defaultSpec(kind: UploadedTemplateKind): TemplateSpec {
  if (kind === 'ai-scene') return { prompt: '', baseGender: 'any', accent: '#C8102E', category: 'special', subName: '' } as AiSceneSpec;
  if (kind === 'badge') return { background: '#FFFFFF', photoSlots: [{ shape: 'circle', cx: 500, cy: 500, r: 330, focus: 'face' }], textSlots: [], defaultFilter: 'natural' };
  const w = TEMPLATE_CANVAS[kind].widths[0];
  const h = kind === 'classic' ? 900 : TEMPLATE_CANVAS['photo-4x6'].height;
  const m = kind === 'classic' ? 24 : 90;
  return {
    background: '#FFFFFF',
    photoSlots: [{ x: m, y: m, w: w - m * 2, h: Math.round((h - m * 2) * 0.72), radius: 0, rotate: 0, focus: 'face' }],
    textSlots: [],
    defaultFilter: kind === 'classic' ? 'mono' : 'natural'
  };
}

async function templateRow(kind: UploadedTemplateKind, id: string) {
  const row = (await db().select().from(catalogTemplates).where(and(eq(catalogTemplates.kind, kind), eq(catalogTemplates.id, id))).limit(1))[0];
  if (!row || row.source !== 'uploaded') throw new AppError('ไม่พบ template', 'not_found');
  return row;
}

/** The template, if this actor may edit it (a customer only its own). */
async function ownedRow(ctx: StudioActor, kind: UploadedTemplateKind, id: string) {
  const row = await templateRow(kind, id);
  if (scopeOf(ctx) && row.orgId !== scopeOf(ctx)) throw new AppError('ไม่พบ template', 'not_found');
  return row;
}

/** A customer's own templates (drafts + published count against its quota). */
export async function shopTemplates(orgId: string) {
  const rows = quotaKinds(await db().select().from(catalogTemplates).where(eq(catalogTemplates.orgId, orgId)).orderBy(desc(catalogTemplates.updatedAt)));
  const org = (await db().select({ quota: organizations.templateQuota }).from(organizations).where(eq(organizations.id, orgId)).limit(1))[0];
  const used = rows.filter((r) => r.status !== 'retired').length;
  return { rows, used, quota: org ? org.quota : 0 };
}

async function versionsOf(kind: UploadedTemplateKind, id: string) {
  return db().select().from(templateVersions).where(and(eq(templateVersions.kind, kind), eq(templateVersions.templateId, id))).orderBy(desc(templateVersions.version));
}

/** The editable version: the newest unpublished one, or null when everything is published. */
export async function studio(kind: UploadedTemplateKind, id: string) {
  const template = await templateRow(kind, id);
  const versions = await versionsOf(kind, id);
  const draft = versions.find((v) => !v.publishedAt) ?? null;
  const published = versions.find((v) => v.version === template.publishedVersion) ?? null;
  return { template, versions, draft, published };
}

export async function createTemplate(ctx: StudioActor, input: z.infer<typeof NewTemplateInput>) {
  const shopId = scopeOf(ctx);
  // The platform may make a template for one customer
  const forOrg = !shopId && input.forOrgId ? (await db().select({ id: organizations.id }).from(organizations).where(eq(organizations.id, input.forOrgId)).limit(1))[0]?.id : null;
  if (!shopId && input.forOrgId && !forOrg) throw new AppError('ไม่พบร้านที่เลือก');
  const orgId = shopId;
  if (orgId) {
    if (!(SHOP_TEMPLATE_KINDS as readonly string[]).includes(input.kind)) throw new AppError('ร้านอัปโหลดได้เฉพาะกรอบภาพ 4x6 และกรอบเข็มกลัด');
    const { used, quota } = await shopTemplates(orgId);
    if (quota !== null && used >= quota) {
      throw new AppError(quota === 0 ? 'ผู้ให้บริการยังไม่ได้เปิดให้ร้านอัปโหลด template' : `ครบจำนวน template ที่ร้านอัปโหลดได้แล้ว (${quota} แบบ) • เลิกใช้แบบเก่า หรือติดต่อผู้ให้บริการ`);
    }
  }
  // A customer's ids never collide with the platform's or another customer's
  const id = orgId ? `tpl_s${randomCode('abcdefghijklmnopqrstuvwxyz0123456789', 10)}` : `tpl_${input.slug}`;
  const owner = orgId ?? forOrg ?? null;
  if (!UPLOADED_ID_PATTERN.test(id)) throw new AppError('รหัสไม่ถูกต้อง');
  if (BUILTIN_CATALOG.some((c) => c.id === id)) throw new AppError('รหัสนี้ถูกใช้แล้ว');
  try {
    await db().transaction(async (tx) => {
      await tx.insert(catalogTemplates).values({
        kind: input.kind,
        id,
        source: 'uploaded',
        status: 'draft',
        orgId: owner,
        name: input.name,
        description: input.description || null,
        tags: input.tags,
        createdBy: ctx.user.id,
        createdAt: new Date(),
        updatedBy: ctx.user.id
      });
      await tx.insert(templateVersions).values({ id: newId('tpv'), kind: input.kind, templateId: id, version: 1, spec: defaultSpec(input.kind), files: {}, createdBy: ctx.user.id });
    });
  } catch (err) {
    if (isDuplicateKey(err)) throw new AppError('รหัสนี้ถูกใช้แล้วในหมวดนี้');
    throw err;
  }
  await audit(auditActor(ctx), { action: 'template.create', resourceType: 'template', resourceId: `${input.kind}:${id}`, after: { name: input.name, ...(forOrg ? { forOrgId: forOrg } : {}) } });
  return id;
}

export async function updateTemplateInfo(ctx: StudioActor, kind: UploadedTemplateKind, id: string, input: z.infer<typeof TemplateInfoInput>) {
  const row = await ownedRow(ctx, kind, id);
  await db()
    .update(catalogTemplates)
    .set({ name: input.name, description: input.description || null, tags: input.tags, updatedBy: ctx.user.id })
    .where(and(eq(catalogTemplates.kind, kind), eq(catalogTemplates.id, id)));
  // Name/description travel in the manifest
  if (row.status === 'published') await bumpManifest();
  await audit(auditActor(ctx), { action: 'template.update', resourceType: 'template', resourceId: `${kind}:${id}`, before: { name: row.name }, after: { name: input.name } });
}

/** The draft to edit, created from the published version when there is none. */
export async function ensureDraft(ctx: StudioActor, kind: UploadedTemplateKind, id: string): Promise<TemplateVersion> {
  await ownedRow(ctx, kind, id);
  const s = await studio(kind, id);
  if (s.draft) return s.draft;
  const base = s.published ?? s.versions[0];
  const version = (s.versions[0]?.version ?? 0) + 1;
  const row = { id: newId('tpv'), kind, templateId: id, version, spec: base?.spec ?? defaultSpec(kind), files: base?.files ?? {}, note: null, createdBy: ctx.user.id };
  await db().insert(templateVersions).values(row);
  return (await studio(kind, id)).draft!;
}

function parseSpec(kind: UploadedTemplateKind, spec: unknown): TemplateSpec {
  const r = kind === 'ai-scene' ? AiSceneSpecSchema.safeParse(spec) : FrameSpecSchema.safeParse(spec);
  if (!r.success) throw new AppError(r.error.issues[0]?.message ?? 'ข้อมูลช่องไม่ถูกต้อง');
  return r.data;
}

/** Saves the draft's slot file (and optionally a freshly rendered preview image). */
export async function saveDraft(ctx: StudioActor, kind: UploadedTemplateKind, id: string, input: { spec: unknown; note?: string; preview?: Uint8Array | null }) {
  const draft = await ensureDraft(ctx, kind, id);
  // AI drafts may be saved with an unfinished prompt; it is checked at publish
  const spec = kind === 'ai-scene' ? ({ ...(draft.spec as AiSceneSpec), ...(input.spec as object) } as AiSceneSpec) : parseSpec(kind, input.spec);
  const files: TemplateFiles = { ...draft.files };
  if (input.preview?.byteLength) files.preview = await storeImage(ctx, input.preview, 'preview', kind);
  await db()
    .update(templateVersions)
    .set({ spec, files, note: input.note?.slice(0, 200) || draft.note })
    .where(eq(templateVersions.id, draft.id));
  return draft.version;
}

async function storeImage(ctx: StudioActor, bytes: Uint8Array, slot: FileSlot, kind: UploadedTemplateKind) {
  const info = imageInfo(bytes);
  if (slot === 'overlay') {
    if (bytes.byteLength > MAX_OVERLAY_BYTES) throw new AppError('ไฟล์กรอบใหญ่เกิน 8 MB');
    if (info?.type !== 'png') throw new AppError('ไฟล์กรอบต้องเป็น PNG');
    if (!info.alpha) throw new AppError('PNG นี้ไม่มีพื้นที่โปร่งใส (ต้องเป็น RGBA และเว้นช่องรูปให้โปร่งใส)');
    const size = overlaySizeIssue(kind as FrameKind, info.width, info.height);
    if (size) throw new AppError(size);
    return putAsset(bytes, 'image/png', { width: info.width, height: info.height, userId: ctx.user.id });
  }
  if (bytes.byteLength > MAX_IMAGE_BYTES) throw new AppError('ไฟล์ภาพใหญ่เกิน 4 MB');
  if (!info) throw new AppError('ไฟล์ต้องเป็น JPG หรือ PNG');
  if (info.width > 4000 || info.height > 6000) throw new AppError('ภาพใหญ่เกินไป (ไม่เกิน 4000 x 6000 px)');
  return putAsset(bytes, info.type === 'png' ? 'image/png' : 'image/jpeg', { width: info.width, height: info.height, userId: ctx.user.id });
}

const SLOTS_BY_KIND: Record<UploadedTemplateKind, FileSlot[]> = {
  'photo-4x6': ['overlay', 'sample'],
  badge: ['overlay', 'sample'],
  classic: ['overlay', 'sample'],
  'ai-scene': ['plate', 'female', 'male']
};

/** Uploads one file into the draft (overlay PNG, designer sample, AI reference images). */
export async function uploadDraftFile(ctx: StudioActor, kind: UploadedTemplateKind, id: string, slot: FileSlot, bytes: Uint8Array) {
  if (!SLOTS_BY_KIND[kind].includes(slot)) throw new AppError('ไฟล์ชนิดนี้ใช้กับหมวดนี้ไม่ได้');
  if (!bytes.byteLength) throw new AppError('ยังไม่ได้เลือกไฟล์');
  const draft = await ensureDraft(ctx, kind, id);
  const ref = await storeImage(ctx, bytes, slot, kind);
  const files: TemplateFiles = { ...draft.files, [slot]: ref };
  // A new overlay makes the old rendered preview stale
  if (slot === 'overlay') delete files.preview;
  await db().update(templateVersions).set({ files }).where(eq(templateVersions.id, draft.id));
  return ref;
}

export async function removeDraftFile(ctx: StudioActor, kind: UploadedTemplateKind, id: string, slot: FileSlot) {
  const draft = await ensureDraft(ctx, kind, id);
  const files: TemplateFiles = { ...draft.files };
  delete files[slot];
  await db().update(templateVersions).set({ files }).where(eq(templateVersions.id, draft.id));
}

/** What still blocks publishing the draft. */
export function publishIssues(kind: UploadedTemplateKind, v: Pick<TemplateVersion, 'spec' | 'files'>, opts: { uploaded?: boolean } = {}): string[] {
  if (kind === 'ai-scene') {
    const issues: string[] = [];
    const r = AiSceneSpecSchema.safeParse(v.spec);
    if (!r.success) issues.push(r.error.issues[0]?.message ?? 'คำอธิบายฉากไม่ครบ');
    // Uploaded scenes are drawn from their brief (built-in ones keep theirs in code)
    else if (opts.uploaded && !r.data.brief) issues.push('ยังไม่ได้กรอกบรีฟสำหรับ AI (แนวภาพ ฉาก แสง ชุด ทรงผม)');
    if (!v.files.plate) issues.push('ยังไม่ได้อัปโหลดภาพฉากต้นแบบ');
    if (!v.files.female && !v.files.male) issues.push('ต้องมีภาพตัวอย่างอย่างน้อย 1 ภาพ (ผู้หญิงหรือผู้ชาย)');
    return issues;
  }
  const r = FrameSpecSchema.safeParse(v.spec);
  if (!r.success) return [r.error.issues[0]?.message ?? 'ข้อมูลช่องไม่ถูกต้อง'];
  const issues = frameIssues(kind, r.data as FrameSpec, v.files.overlay);
  if (!v.files.preview) issues.push('ยังไม่มีภาพตัวอย่าง (กดบันทึกในหน้าแก้ไขเพื่อสร้าง)');
  return issues;
}

/** Publishes the draft as the live version: kiosks pick it up from the manifest. */
export async function publishDraft(ctx: StudioActor, kind: UploadedTemplateKind, id: string) {
  await ownedRow(ctx, kind, id);
  const s = await studio(kind, id);
  if (!s.draft) throw new AppError('ไม่มีร่างที่รอเผยแพร่');
  const issues = publishIssues(kind, s.draft, { uploaded: s.template.source === 'uploaded' });
  if (issues.length) throw new AppError(`ยังเผยแพร่ไม่ได้: ${issues.join(' • ')}`);
  return goLive(ctx, s.template.status, s.template.orgId, kind, id, s.draft.version, s.draft.id, 'template.version_publish');
}

/** Makes an older (already published once) version live again. */
export async function rollbackTo(ctx: StudioActor, kind: UploadedTemplateKind, id: string, version: number) {
  await ownedRow(ctx, kind, id);
  const s = await studio(kind, id);
  const v = s.versions.find((x) => x.version === version);
  if (!v?.publishedAt) throw new AppError('ย้อนกลับได้เฉพาะเวอร์ชันที่เคยเผยแพร่แล้ว');
  if (s.template.publishedVersion === version) throw new AppError('เวอร์ชันนี้ใช้งานอยู่แล้ว');
  return goLive(ctx, s.template.status, s.template.orgId, kind, id, version, v.id, 'template.rollback');
}

async function goLive(ctx: StudioActor, status: string, ownerOrgId: string | null, kind: UploadedTemplateKind, id: string, version: number, versionRowId: string, action: string) {
  const now = new Date();
  await db().transaction(async (tx) => {
    await tx.update(templateVersions).set({ publishedAt: now }).where(and(eq(templateVersions.id, versionRowId)));
    // Publishing a retired template's new version keeps it retired until re-enabled
    await tx
      .update(catalogTemplates)
      .set({ publishedVersion: version, status: status === 'retired' ? 'retired' : 'published', updatedBy: ctx.user.id })
      .where(and(eq(catalogTemplates.kind, kind), eq(catalogTemplates.id, id)));
  });
  const revision = await bumpManifest();
  // First publish: kiosks whose list says "all" now include it → push a config revision too
  // (a customer's template only reaches that customer's kiosks)
  const bumped = status !== 'draft' ? 0 : ownerOrgId ? await bumpAllKiosks(ownerOrgId, ctx.user.id, `ร้านเพิ่ม template ${id}`) : await bumpEveryKiosk(ctx.user.id, `ส่วนกลางเพิ่ม template ${id}`);
  await audit(auditActor(ctx), { action, resourceType: 'template', resourceId: `${kind}:${id}`, after: { version, manifestRevision: revision, kiosksUpdated: bumped } });
  return { version, revision };
}

/** Throws away the unpublished draft (the template keeps its published version). */
export async function discardDraft(ctx: StudioActor, kind: UploadedTemplateKind, id: string) {
  await ownedRow(ctx, kind, id);
  const s = await studio(kind, id);
  if (!s.draft) return;
  if (!s.published) throw new AppError('template นี้ยังไม่เคยเผยแพร่ ไม่มีเวอร์ชันให้กลับไป');
  await db().delete(templateVersions).where(eq(templateVersions.id, s.draft.id));
  await audit(auditActor(ctx), { action: 'template.discard_draft', resourceType: 'template', resourceId: `${kind}:${id}`, after: { version: s.draft.version } });
}

/**
 * A customer stops / restarts offering one of its own templates (its kiosks only). Retired
 * templates do not count against the quota and leave the kiosks' manifest.
 */
export async function setOwnTemplateStatus(ctx: StudioActor, kind: UploadedTemplateKind, id: string, status: 'published' | 'retired') {
  const orgId = scopeOf(ctx);
  if (!orgId) throw new AppError('ใช้หน้าคลัง Template ของแพลตฟอร์ม');
  const row = await ownedRow(ctx, kind, id);
  if (!row.publishedVersion) throw new AppError('template นี้ยังไม่เคยเผยแพร่');
  if (status === 'published' && row.status === 'retired') {
    const { used, quota } = await shopTemplates(orgId);
    if (quota !== null && used >= quota) throw new AppError(`ครบจำนวน template ที่ร้านอัปโหลดได้แล้ว (${quota} แบบ)`);
  }
  await db().update(catalogTemplates).set({ status, updatedBy: ctx.user.id }).where(and(eq(catalogTemplates.kind, kind), eq(catalogTemplates.id, id)));
  await bumpManifest();
  const bumped = await bumpAllKiosks(orgId, ctx.user.id, status === 'retired' ? `ร้านเลิกใช้ template ${id}` : `ร้านเปิดใช้ template ${id}`);
  await audit(auditActor(ctx), { action: status === 'retired' ? 'template.retire' : 'template.publish', resourceType: 'template', resourceId: `${kind}:${id}`, after: { kiosksUpdated: bumped } });
  return bumped;
}
