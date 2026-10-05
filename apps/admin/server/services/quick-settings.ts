import 'server-only';
import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import { z } from 'zod';
import type { KioskSettings } from '@photobooth/contracts';
import { db } from '@/server/db/client';
import { configEvents, kiosks } from '@/server/db/schema';
import { assertCan, type OrgContext } from '@/server/auth/context';
import { AppError } from '@/server/lib/errors';
import { normalizeOwnSections, sourceLabel } from '@/lib/config-layers';
import { resolvePermissions, type ConfigSectionId } from '@/lib/config-permissions';
import { getKiosk } from './kiosks';
import { currentSettings, saveKioskConfig } from './kiosk-config';
import { orgDefaults, sourceFor } from './config-sources';
import { saveDefaults, saveEventSettings } from './config-presets';

/**
 * Event Console › ตั้งค่าด่วน: a few settings changed on the spot (event text, free use and
 * prices, printing, frames). Each part goes to the layer the shop picks: the kiosk's งาน /
 * ค่ากลาง (every kiosk following it) or this kiosk only. Saving goes through the normal config
 * services, so permissions, validation, the audit log and pushing to kiosks stay the same.
 */

const price = z.number().int().min(0).max(100_000);
const idList = z.array(z.string().min(1).max(64)).max(200);

export const QuickPatchSchema = z.object({
  event: z.object({ title: z.string().max(80), subtitle: z.string().max(120), date: z.string().max(40) }).optional(),
  payment: z.object({ bypass: z.boolean() }).optional(),
  products: z.object({ photo: price, badge: price, bundle: price, ai: price }).optional(),
  print: z.object({ photo: z.boolean(), badge: z.boolean(), queueSlip: z.boolean() }).optional(),
  templates: z.object({ photoLayouts: idList, photoDefaultLayout: z.string().min(1).max(64), badgeFrames: idList, badgeDefaultFrame: z.string().min(1).max(64) }).optional()
});
export type QuickPatch = z.infer<typeof QuickPatchSchema>;

export const QuickSaveInput = z.object({
  kioskRowId: z.string().max(32),
  /** 'source' = the kiosk's งาน / ค่ากลาง (sections the kiosk sets itself still stay on the kiosk). */
  target: z.enum(['source', 'kiosk']),
  patch: QuickPatchSchema,
  note: z.string().trim().max(120).default('')
});

const SECTION_OF: Record<keyof QuickPatch, ConfigSectionId> = { event: 'brand', payment: 'payment', products: 'products', print: 'print', templates: 'templates' };

function applyPatch(s: KioskSettings, p: QuickPatch): KioskSettings {
  const out = structuredClone(s);
  if (p.event) out.event = { ...out.event, ...p.event };
  if (p.payment) out.payment = { ...out.payment, bypass: p.payment.bypass };
  if (p.products) {
    out.products.photo.price = p.products.photo;
    out.products.badge.price = p.products.badge;
    out.products.bundle.price = p.products.bundle;
    out.products.ai.price = p.products.ai;
  }
  if (p.print) out.print = { ...out.print, ...p.print };
  if (p.templates) out.templates = { ...out.templates, ...p.templates };
  return out;
}

const touched = (p: QuickPatch) => (Object.keys(SECTION_OF) as (keyof QuickPatch)[]).filter((k) => p[k] !== undefined);
const withoutPin = ({ adminPin: _pin, ...rest }: KioskSettings) => rest;

/** Kiosks that take a layer's values (to say how many change). */
async function followersOf(ctx: OrgContext, eventId: string | null) {
  const rows = await db()
    .select({ id: kiosks.id, own: kiosks.ownSections })
    .from(kiosks)
    .leftJoin(configEvents, eq(configEvents.id, kiosks.eventId))
    .where(
      and(
        eq(kiosks.orgId, ctx.org.id),
        inArray(kiosks.status, ['pending', 'active', 'disabled']),
        eventId ? eq(kiosks.eventId, eventId) : or(isNull(kiosks.eventId), eq(configEvents.isActive, false))
      )
    );
  return rows;
}

/** What the quick-settings panel shows for one kiosk. */
export async function quickSettingsView(ctx: OrgContext, kioskRowId: string) {
  const { kiosk } = await getKiosk(ctx, kioskRowId);
  assertCan(ctx, 'config.edit', { branchId: kiosk.branchId });
  const cur = await currentSettings(kiosk);
  if (!cur) throw new AppError('ตู้นี้ยังไม่มีการตั้งค่า');
  const own = normalizeOwnSections(kiosk.ownSections);
  const { source } = await sourceFor(ctx.org.id, kiosk.eventId);
  const followers = await followersOf(ctx, source.kind === 'event' ? source.id : null);
  const perms = resolvePermissions(ctx.org.configPermissions);
  const s = cur.settings;
  return {
    kiosk: { id: kiosk.id, name: kiosk.name, revision: cur.revision },
    values: {
      event: { title: s.event.title, subtitle: s.event.subtitle, date: s.event.date },
      payment: { bypass: s.payment.bypass, enabled: s.payment.enabled },
      products: { photo: s.products.photo.price, badge: s.products.badge.price, bundle: s.products.bundle.price, ai: s.products.ai.price },
      print: { photo: s.print.photo, badge: s.print.badge, queueSlip: s.print.queueSlip },
      templates: { photoLayouts: s.templates.photoLayouts, photoDefaultLayout: s.templates.photoDefaultLayout, badgeFrames: s.templates.badgeFrames, badgeDefaultFrame: s.templates.badgeDefaultFrame }
    } satisfies QuickPatch & { payment: { bypass: boolean; enabled: boolean } },
    appMode: s.appMode,
    /** Sections this kiosk sets itself (they never change other kiosks). */
    own: (Object.values(SECTION_OF) as ConfigSectionId[]).filter((id) => own.includes(id)),
    /** Sections the shop may not edit (set by the platform). */
    locked: ctx.principal.platformRole ? [] : (Object.values(SECTION_OF) as ConfigSectionId[]).filter((id) => perms[id] !== 'edit'),
    source: { label: sourceLabel(source), kind: source.kind, kiosks: followers.length },
    /** Org-wide layers need config rights for every branch. */
    canSource: !!ctx.principal.platformRole || ctx.principal.branches === 'all'
  };
}

export async function saveQuickSettings(ctx: OrgContext, input: z.infer<typeof QuickSaveInput>) {
  const { kiosk } = await getKiosk(ctx, input.kioskRowId);
  assertCan(ctx, 'config.edit', { branchId: kiosk.branchId });
  const parts = touched(input.patch);
  if (!parts.length) return { source: null, kiosk: null };
  const own = normalizeOwnSections(kiosk.ownSections);
  const note = `ตั้งค่าด่วนจาก Event Console${input.note ? `: ${input.note}` : ''}`;

  // Parts for the layer (unless the kiosk sets that section itself, or "this kiosk only")
  const toSource = input.target === 'source' ? parts.filter((k) => !own.includes(SECTION_OF[k])) : [];
  const toKiosk = parts.filter((k) => !toSource.includes(k));
  const pick = (keys: (keyof QuickPatch)[]) => Object.fromEntries(keys.map((k) => [k, input.patch[k]])) as QuickPatch;

  let sourceResult: { label: string; kiosks: number } | null = null;
  if (toSource.length) {
    const { source, settings } = await sourceFor(ctx.org.id, kiosk.eventId);
    const next = withoutPin(applyPatch(settings, pick(toSource)));
    if (source.kind === 'event') {
      const ev = (await db().select({ updatedAt: configEvents.updatedAt }).from(configEvents).where(eq(configEvents.id, source.id)).limit(1))[0]!;
      const r = await saveEventSettings(ctx, source.id, { baseUpdatedAt: ev.updatedAt.toISOString(), settings: next, pin: { action: 'keep' }, note });
      sourceResult = { label: sourceLabel(source), kiosks: r.kiosks };
    } else {
      const d = await orgDefaults(ctx.org.id);
      const r = await saveDefaults(ctx, { baseUpdatedAt: d.updatedAt ? d.updatedAt.toISOString() : null, settings: next, pin: { action: 'keep' }, note });
      sourceResult = { label: sourceLabel(source), kiosks: r.kiosks };
    }
  }

  let kioskResult: { revision: number } | null = null;
  if (toKiosk.length) {
    // Read again: the layer's save may already have given this kiosk a new revision
    const fresh = (await getKiosk(ctx, kiosk.id)).kiosk;
    const cur = await currentSettings(fresh);
    if (!cur) throw new AppError('ตู้นี้ยังไม่มีการตั้งค่า');
    const ownSections = [...new Set([...normalizeOwnSections(fresh.ownSections), ...toKiosk.map((k) => SECTION_OF[k])])];
    const r = await saveKioskConfig(ctx, kiosk.id, {
      baseRevision: cur.revision,
      settings: withoutPin(applyPatch(cur.settings, pick(toKiosk))),
      pin: { action: 'keep' },
      note,
      ownSections
    });
    kioskResult = { revision: r.revision };
  }
  return { source: sourceResult, kiosk: kioskResult };
}
