import 'server-only';
import { and, desc, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { KioskSettingsSchema, withSettingsDefaults, type KioskSettings } from '@photobooth/contracts';
import { hashAdminPin } from '@photobooth/contracts/node';
import { db } from '@/server/db/client';
import { configEvents, kiosks, orgConfigDefaults } from '@/server/db/schema';
import { assertCan, type OrgContext } from '@/server/auth/context';
import { audit } from '@/server/audit';
import { AppError, forbidden, notFound } from '@/server/lib/errors';
import { newId } from '@/server/lib/ids';
import { diffSettings } from '@/lib/settings-diff';
import { composeSettings, sourceLabel, type SettingsSource } from '@/lib/config-layers';
import { PinChange, SaveConfigInput, appendRevision, checkBusinessRules, checkPermissions, currentSettings } from './kiosk-config';
import { orgDefaults, sourceFor } from './config-sources';

const actor = (ctx: OrgContext) => ({ user: ctx.user, orgId: ctx.org.id, actingAsPlatform: ctx.actingAsPlatform });

export const SavePresetInput = z.object({
  /** updatedAt the editor started from (ISO); a newer save in between is a conflict. */
  baseUpdatedAt: z.string().max(40).nullable(),
  settings: SaveConfigInput.shape.settings,
  pin: PinChange,
  note: z.string().trim().max(255).default('')
});

export const EventInfoInput = z.object({
  name: z.string().trim().min(1, 'กรอกชื่องาน').max(120),
  note: z.string().trim().max(500).default('')
});

/** Presets apply to kiosks of every branch, so they need config rights for the whole customer. */
function assertOrgWide(ctx: OrgContext) {
  assertCan(ctx, 'config.edit');
  if (!ctx.principal.platformRole && ctx.principal.branches !== 'all') throw forbidden();
}

function withPin(prev: KioskSettings, input: z.infer<typeof SavePresetInput>): KioskSettings {
  const adminPin = input.pin.action === 'set' ? hashAdminPin(input.pin.pin) : input.pin.action === 'clear' ? null : prev.adminPin;
  return KioskSettingsSchema.parse({ ...input.settings, adminPin });
}

const sameTime = (a: Date | null, iso: string | null) => (a ? a.toISOString() : null) === iso;

/**
 * Publishes a new revision to every kiosk that follows the changed layer and whose settings
 * actually change. Kiosks keep their own sections. Returns how many kiosks got a revision.
 */
async function propagate(ctx: OrgContext, which: { eventId: string } | { defaults: true }, note: string): Promise<number> {
  const followers = await db()
    .select()
    .from(kiosks)
    .where(
      and(
        eq(kiosks.orgId, ctx.org.id),
        inArray(kiosks.status, ['pending', 'active', 'disabled']),
        gt(kiosks.currentRevision, 0),
        'eventId' in which
          ? eq(kiosks.eventId, which.eventId)
          : or(isNull(kiosks.eventId), sql`${kiosks.eventId} in (select id from config_events where org_id = ${ctx.org.id} and is_active = false)`)
      )
    );
  let updated = 0;
  for (const k of followers) {
    if (k.ownSections == null) continue; // kiosks from before presets set everything themselves
    for (let attempt = 0; attempt < 2; attempt++) {
      const kiosk = attempt ? (await db().select().from(kiosks).where(eq(kiosks.id, k.id)).limit(1))[0]! : k;
      const current = await currentSettings(kiosk);
      if (!current) break;
      const { settings: src } = await sourceFor(ctx.org.id, kiosk.eventId);
      const next = composeSettings(current.settings, src, kiosk.ownSections);
      if (!diffSettings(current.settings, next).length) break;
      try {
        await db().transaction((tx) => appendRevision(tx, kiosk, kiosk.currentRevision, next, note, ctx.user.id));
        updated++;
        break;
      } catch (err) {
        if (!(err instanceof AppError && err.code === 'conflict') || attempt) throw err;
      }
    }
  }
  return updated;
}

// ─── ค่ากลาง ────────────────────────────────────────────────────────────────

export async function getDefaultsEditor(ctx: OrgContext) {
  const d = await orgDefaults(ctx.org.id);
  // No event, or an event that has been closed
  const following = await db()
    .select({ id: kiosks.id, name: kiosks.name, ownSections: kiosks.ownSections, eventId: kiosks.eventId })
    .from(kiosks)
    .leftJoin(configEvents, eq(configEvents.id, kiosks.eventId))
    .where(and(eq(kiosks.orgId, ctx.org.id), inArray(kiosks.status, ['pending', 'active', 'disabled']), or(isNull(kiosks.eventId), eq(configEvents.isActive, false))));
  return { ...d, following };
}

export async function saveDefaults(ctx: OrgContext, input: z.infer<typeof SavePresetInput>) {
  assertOrgWide(ctx);
  const prev = await orgDefaults(ctx.org.id);
  if (!sameTime(prev.updatedAt, input.baseUpdatedAt)) throw new AppError('มีคนบันทึกค่ากลางก่อนหน้าคุณ โหลดหน้าใหม่แล้วลองอีกครั้ง', 'conflict');
  const settings = withPin(prev.settings, input);
  checkPermissions(ctx, prev.saved ? prev.settings : null, settings);
  await checkBusinessRules(ctx, settings);
  const changes = diffSettings(prev.settings, settings);
  if (prev.saved && !changes.length) return { changed: false, kiosks: 0 };

  await db()
    .insert(orgConfigDefaults)
    .values({ orgId: ctx.org.id, settings, updatedBy: ctx.user.id })
    .onDuplicateKeyUpdate({ set: { settings, updatedBy: ctx.user.id, updatedAt: new Date() } });
  await audit(actor(ctx), { action: 'config.defaults', resourceType: 'org', resourceId: ctx.org.id, after: { note: input.note, changes: changes.map((c) => ({ field: c.label, before: c.before, after: c.after })) } });
  const n = await propagate(ctx, { defaults: true }, input.note ? `ค่ากลาง: ${input.note}` : 'ค่ากลางเปลี่ยน');
  return { changed: true, kiosks: n };
}

// ─── งาน ────────────────────────────────────────────────────────────────────

export async function listEvents(ctx: OrgContext) {
  const rows = await db().select().from(configEvents).where(eq(configEvents.orgId, ctx.org.id)).orderBy(desc(configEvents.isActive), desc(configEvents.updatedAt));
  const counts = await db()
    .select({ eventId: kiosks.eventId, n: sql<number>`count(*)` })
    .from(kiosks)
    .where(and(eq(kiosks.orgId, ctx.org.id), inArray(kiosks.status, ['pending', 'active', 'disabled'])))
    .groupBy(kiosks.eventId);
  return rows.map((e) => ({ id: e.id, name: e.name, note: e.note, isActive: e.isActive, updatedAt: e.updatedAt, kiosks: Number(counts.find((c) => c.eventId === e.id)?.n ?? 0) }));
}

/** Settings sources a kiosk can follow, for the kiosk editor (no PIN hashes). */
export async function editorSources(ctx: OrgContext): Promise<{ source: SettingsSource; label: string; settings: Omit<KioskSettings, 'adminPin'>; hasPin: boolean }[]> {
  const d = await orgDefaults(ctx.org.id);
  const events = await db().select().from(configEvents).where(and(eq(configEvents.orgId, ctx.org.id), eq(configEvents.isActive, true))).orderBy(configEvents.name);
  const strip = (s: KioskSettings) => {
    const { adminPin, ...rest } = s;
    return { settings: rest, hasPin: !!adminPin };
  };
  return [
    { source: { kind: 'defaults' } as SettingsSource, label: 'ค่ากลาง', ...strip(d.settings) },
    ...events.map((e) => {
      const source: SettingsSource = { kind: 'event', id: e.id, name: e.name };
      return { source, label: sourceLabel(source), ...strip(withSettingsDefaults(e.settings)) };
    })
  ];
}

async function eventRow(ctx: OrgContext, id: string) {
  const ev = (await db().select().from(configEvents).where(and(eq(configEvents.id, id), eq(configEvents.orgId, ctx.org.id))).limit(1))[0];
  if (!ev) throw notFound('งาน');
  return ev;
}

export async function getEventEditor(ctx: OrgContext, id: string) {
  const ev = await eventRow(ctx, id);
  const following = await db()
    .select({ id: kiosks.id, name: kiosks.name, ownSections: kiosks.ownSections, status: kiosks.status })
    .from(kiosks)
    .where(and(eq(kiosks.orgId, ctx.org.id), eq(kiosks.eventId, id), inArray(kiosks.status, ['pending', 'active', 'disabled'])));
  return { event: { ...ev, settings: withSettingsDefaults(ev.settings) }, following };
}

export async function createEvent(ctx: OrgContext, input: z.infer<typeof EventInfoInput>): Promise<string> {
  assertOrgWide(ctx);
  const id = newId('evt');
  const { settings } = await orgDefaults(ctx.org.id);
  await db().insert(configEvents).values({ id, orgId: ctx.org.id, name: input.name, note: input.note, settings, createdBy: ctx.user.id });
  await audit(actor(ctx), { action: 'config.event_create', resourceType: 'config_event', resourceId: id, after: input });
  return id;
}

export async function updateEventInfo(ctx: OrgContext, id: string, input: z.infer<typeof EventInfoInput>) {
  assertOrgWide(ctx);
  const ev = await eventRow(ctx, id);
  await db().update(configEvents).set(input).where(eq(configEvents.id, ev.id));
  await audit(actor(ctx), { action: 'config.event_update', resourceType: 'config_event', resourceId: id, before: { name: ev.name, note: ev.note }, after: input });
}

/** Closing an event sends its kiosks back to the defaults (and opening it brings them back). */
export async function setEventActive(ctx: OrgContext, id: string, isActive: boolean) {
  assertOrgWide(ctx);
  const ev = await eventRow(ctx, id);
  if (ev.isActive === isActive) return 0;
  await db().update(configEvents).set({ isActive }).where(eq(configEvents.id, ev.id));
  await audit(actor(ctx), { action: isActive ? 'config.event_open' : 'config.event_close', resourceType: 'config_event', resourceId: id });
  return propagate(ctx, { eventId: id }, isActive ? `เปิดงาน "${ev.name}" อีกครั้ง` : `ปิดงาน "${ev.name}" (กลับไปใช้ค่ากลาง)`);
}

export async function saveEventSettings(ctx: OrgContext, id: string, input: z.infer<typeof SavePresetInput>) {
  assertOrgWide(ctx);
  const ev = await eventRow(ctx, id);
  if (!sameTime(ev.updatedAt, input.baseUpdatedAt)) throw new AppError('มีคนบันทึกงานนี้ก่อนหน้าคุณ โหลดหน้าใหม่แล้วลองอีกครั้ง', 'conflict');
  const prev = withSettingsDefaults(ev.settings);
  const settings = withPin(prev, input);
  checkPermissions(ctx, prev, settings);
  await checkBusinessRules(ctx, settings);
  const changes = diffSettings(prev, settings);
  if (!changes.length) return { changed: false, kiosks: 0 };
  await db().update(configEvents).set({ settings }).where(eq(configEvents.id, ev.id));
  await audit(actor(ctx), { action: 'config.event_settings', resourceType: 'config_event', resourceId: id, after: { note: input.note, changes: changes.map((c) => ({ field: c.label, before: c.before, after: c.after })) } });
  const n = ev.isActive ? await propagate(ctx, { eventId: id }, input.note ? `งาน "${ev.name}": ${input.note}` : `งาน "${ev.name}" เปลี่ยน`) : 0;
  return { changed: true, kiosks: n };
}
