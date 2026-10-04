import 'server-only';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { AI_SCENE_IDS, BADGE_FRAME_IDS, CLASSIC_TEMPLATE_IDS, PHOTO_LAYOUT_IDS } from '@photobooth/catalog';
import { KioskSettingsBaseSchema, KioskSettingsSchema, type KioskSettings } from '@photobooth/contracts';
import { hashAdminPin } from '@photobooth/contracts/node';
import { db, type Db } from '@/server/db/client';
import { catalogTemplates, configAcks, kioskConfigRevisions, kiosks, orgStorage, users, type Kiosk } from '@/server/db/schema';
import { assertCan, type OrgContext } from '@/server/auth/context';
import { orgWhere } from '@/server/tenancy/scoped';
import { audit } from '@/server/audit';
import { AppError, notFound } from '@/server/lib/errors';
import { diffSettings } from '@/lib/settings-diff';
import { CONFIG_SECTIONS, lockedChanges, resolvePermissions } from '@/lib/config-permissions';
import { getKiosk } from './kiosks';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export const PinChange = z.discriminatedUnion('action', [
  z.object({ action: z.literal('keep') }),
  z.object({ action: z.literal('clear') }),
  z.object({ action: z.literal('set'), pin: z.string().regex(/^\d{4,8}$/, 'รหัสผู้ดูแลเป็นตัวเลข 4-8 หลัก') })
]);

export const SaveConfigInput = z.object({
  baseRevision: z.number().int().min(0),
  /** The editor never sees the PIN hash; adminPin comes from `pin`. */
  settings: KioskSettingsBaseSchema.omit({ adminPin: true }),
  pin: PinChange,
  note: z.string().trim().max(255).default('')
});

/**
 * Appends revision `expected + 1`. The UPDATE … WHERE current_revision = expected makes two
 * concurrent saves impossible: the second one changes 0 rows and gets a conflict.
 */
async function appendRevision(tx: Tx, kiosk: Pick<Kiosk, 'id' | 'orgId'>, expected: number, settings: KioskSettings, note: string, userId: string | null): Promise<number> {
  const [res] = await tx
    .update(kiosks)
    .set({ currentRevision: expected + 1 })
    .where(and(eq(kiosks.id, kiosk.id), eq(kiosks.currentRevision, expected)));
  if (res.affectedRows !== 1) throw new AppError('มีคนบันทึกการตั้งค่าของตู้นี้ก่อนหน้าคุณ โหลดหน้าใหม่แล้วลองอีกครั้ง', 'conflict');
  await tx.insert(kioskConfigRevisions).values({ kioskRowId: kiosk.id, revision: expected + 1, orgId: kiosk.orgId, settings, note, createdBy: userId });
  return expected + 1;
}

async function revisionRow(kioskRowId: string, revision: number) {
  return (await db().select().from(kioskConfigRevisions).where(and(eq(kioskConfigRevisions.kioskRowId, kioskRowId), eq(kioskConfigRevisions.revision, revision))).limit(1))[0];
}

export async function currentSettings(kiosk: Pick<Kiosk, 'id' | 'currentRevision'>): Promise<{ revision: number; settings: KioskSettings; createdAt: Date } | null> {
  if (!kiosk.currentRevision) return null;
  const r = await revisionRow(kiosk.id, kiosk.currentRevision);
  return r ? { revision: r.revision, settings: r.settings as KioskSettings, createdAt: r.createdAt } : null;
}

/** Rules that need the database or the customer's account, on top of the schema. */
async function checkBusinessRules(ctx: OrgContext, s: KioskSettings) {
  const issues: Record<string, string> = {};
  if (s.payment.enabled && s.payment.mode === 'live' && !ctx.org.livePaymentsAllowed) {
    issues['payment.mode'] = 'บัญชีนี้ยังไม่ได้รับอนุญาตให้รับเงินจริง ใช้โหมดทดสอบไปก่อน';
  }
  if (s.share.enabled) {
    const storage = (await db().select({ orgId: orgStorage.orgId }).from(orgStorage).where(eq(orgStorage.orgId, ctx.org.id)).limit(1))[0];
    if (!storage) issues['share.enabled'] = 'บัญชีนี้ยังไม่มีพื้นที่เก็บภาพ ติดต่อผู้ดูแลแพลตฟอร์ม';
  }
  // Template ids: built-in, or uploaded by the platform and published at least once (a retired
  // one may still sit in a saved list; kiosks never receive it)
  const uploaded = await db()
    .select({ kind: catalogTemplates.kind, id: catalogTemplates.id })
    .from(catalogTemplates)
    .where(and(eq(catalogTemplates.source, 'uploaded'), inArray(catalogTemplates.status, ['published', 'retired'])));
  const known = (kind: (typeof catalogTemplates.$inferSelect)['kind'], builtin: readonly string[]) => (id: string) => builtin.includes(id) || uploaded.some((u) => u.kind === kind && u.id === id);
  const checks: [string, string[], (id: string) => boolean, string][] = [
    ['templates.photoLayouts', [...s.templates.photoLayouts, s.templates.photoDefaultLayout], known('photo-4x6', PHOTO_LAYOUT_IDS), 'กรอบ'],
    ['templates.badgeFrames', [...s.templates.badgeFrames, s.templates.badgeDefaultFrame], known('badge', BADGE_FRAME_IDS), 'กรอบเข็มกลัด'],
    ['templates.classic', s.templates.classic, known('classic', CLASSIC_TEMPLATE_IDS), 'template Classic'],
    ['templates.aiScenes', s.templates.aiScenes, known('ai-scene', AI_SCENE_IDS), 'ฉาก AI']
  ];
  for (const [path, ids, ok, label] of checks) {
    const bad = ids.find((id) => !ok(id));
    if (bad) issues[path] = `ไม่พบ${label} "${bad}"`;
  }
  if (!s.products.photo.sell && !s.products.badge.sell && !s.products.bundle.sell && s.appMode === 'photo') {
    issues['products.photo.sell'] = 'โหมด Photo 4x6 ต้องขายอย่างน้อย 1 อย่าง';
  }
  if (Object.keys(issues).length) throw new AppError('ตรวจสอบการตั้งค่าไม่ผ่าน', 'invalid', issues);
}

/**
 * Customers may only change the sections the platform left editable (docs §17.4). Checked
 * here so a direct API call cannot bypass the locked fields in the editor.
 */
function checkPermissions(ctx: OrgContext, before: KioskSettings | null, after: KioskSettings) {
  if (ctx.principal.platformRole || !before) return;
  const locked = lockedChanges(resolvePermissions(ctx.org.configPermissions), before, after);
  if (!locked.length) return;
  const names = locked.map((id) => CONFIG_SECTIONS.find((s) => s.id === id)?.label ?? id);
  throw new AppError(`หมวดนี้จัดการโดยผู้ให้บริการ แก้ไม่ได้: ${names.join(', ')}`, 'forbidden');
}

export async function getConfigEditor(ctx: OrgContext, kioskRowId: string) {
  const { kiosk } = await getKiosk(ctx, kioskRowId);
  const current = await currentSettings(kiosk);
  const lastAck = (
    await db()
      .select()
      .from(configAcks)
      .where(and(eq(configAcks.kioskRowId, kiosk.id), eq(configAcks.orgId, ctx.org.id)))
      .orderBy(desc(configAcks.receivedAt))
      .limit(1)
  )[0];
  return { kiosk, current, lastAck: lastAck ?? null };
}

export async function saveKioskConfig(ctx: OrgContext, kioskRowId: string, input: z.infer<typeof SaveConfigInput>) {
  const { kiosk } = await getKiosk(ctx, kioskRowId);
  assertCan(ctx, 'config.edit', { branchId: kiosk.branchId });
  if (kiosk.status === 'revoked') throw new AppError('ตู้นี้ยกเลิกการเชื่อมต่อแล้ว');

  const current = await currentSettings(kiosk);
  const adminPin = input.pin.action === 'set' ? hashAdminPin(input.pin.pin) : input.pin.action === 'clear' ? null : (current?.settings.adminPin ?? null);
  const settings = KioskSettingsSchema.parse({ ...input.settings, adminPin });
  checkPermissions(ctx, current?.settings ?? null, settings);
  await checkBusinessRules(ctx, settings);

  const changes = diffSettings(current?.settings ?? null, settings);
  if (current && !changes.length) return { revision: current.revision, changed: false };

  const revision = await db().transaction((tx) => appendRevision(tx, kiosk, input.baseRevision, settings, input.note, ctx.user.id));
  await audit({ user: ctx.user, orgId: ctx.org.id, actingAsPlatform: ctx.actingAsPlatform }, {
    action: 'config.publish',
    resourceType: 'kiosk',
    resourceId: kiosk.id,
    after: { revision, note: input.note, changes: changes.map((c) => ({ field: c.label, before: c.before, after: c.after })) }
  });
  return { revision, changed: true };
}

/** Restores an old revision by publishing its settings as a new revision (history stays linear). */
export async function rollbackKioskConfig(ctx: OrgContext, kioskRowId: string, toRevision: number, baseRevision: number) {
  const { kiosk } = await getKiosk(ctx, kioskRowId);
  assertCan(ctx, 'config.edit', { branchId: kiosk.branchId });
  const old = (
    await db()
      .select()
      .from(kioskConfigRevisions)
      .where(orgWhere(ctx, kioskConfigRevisions.orgId, eq(kioskConfigRevisions.kioskRowId, kiosk.id), eq(kioskConfigRevisions.revision, toRevision)))
      .limit(1)
  )[0];
  if (!old) throw notFound('revision');
  const settings = KioskSettingsSchema.parse(old.settings);
  checkPermissions(ctx, (await currentSettings(kiosk))?.settings ?? null, settings);
  await checkBusinessRules(ctx, settings);
  const revision = await db().transaction((tx) => appendRevision(tx, kiosk, baseRevision, settings, `ย้อนกลับไป revision ${toRevision}`, ctx.user.id));
  await audit({ user: ctx.user, orgId: ctx.org.id, actingAsPlatform: ctx.actingAsPlatform }, {
    action: 'config.rollback',
    resourceType: 'kiosk',
    resourceId: kiosk.id,
    after: { revision, from: toRevision }
  });
  return revision;
}

export async function listRevisions(ctx: OrgContext, kioskRowId: string) {
  const { kiosk } = await getKiosk(ctx, kioskRowId);
  const rows = await db()
    .select({ revision: kioskConfigRevisions.revision, settings: kioskConfigRevisions.settings, note: kioskConfigRevisions.note, createdAt: kioskConfigRevisions.createdAt, userName: users.name })
    .from(kioskConfigRevisions)
    .leftJoin(users, eq(users.id, kioskConfigRevisions.createdBy))
    .where(orgWhere(ctx, kioskConfigRevisions.orgId, eq(kioskConfigRevisions.kioskRowId, kiosk.id)))
    .orderBy(desc(kioskConfigRevisions.revision))
    .limit(50);
  const acks = await db()
    .select()
    .from(configAcks)
    .where(orgWhere(ctx, configAcks.orgId, eq(configAcks.kioskRowId, kiosk.id)))
    .orderBy(desc(configAcks.receivedAt))
    .limit(200);
  return {
    kiosk,
    revisions: rows.map((r, i) => ({
      revision: r.revision,
      note: r.note,
      createdAt: r.createdAt,
      userName: r.userName,
      changes: diffSettings(rows[i + 1]?.settings ?? null, r.settings),
      ack: acks.find((a) => a.revision === r.revision) ?? null
    }))
  };
}

/**
 * Gives every paired/pending kiosk of a customer a new revision with unchanged settings, so
 * they fetch the config (and its fresh secrets) again. Used when storage keys change.
 */
export async function bumpAllKiosks(orgId: string, userId: string, note: string): Promise<number> {
  const list = await db()
    .select({ id: kiosks.id, orgId: kiosks.orgId, currentRevision: kiosks.currentRevision })
    .from(kiosks)
    .where(and(eq(kiosks.orgId, orgId), inArray(kiosks.status, ['active', 'pending'])));
  let bumped = 0;
  for (const k of list) {
    const current = await currentSettings(k);
    if (!current) continue;
    try {
      await db().transaction((tx) => appendRevision(tx, k, k.currentRevision, current.settings, note, userId));
      bumped++;
    } catch (err) {
      if (!(err instanceof AppError && err.code === 'conflict')) throw err; // someone saved meanwhile: that revision carries the new secrets too
    }
  }
  return bumped;
}
