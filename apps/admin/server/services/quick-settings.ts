import 'server-only';
import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import { z } from 'zod';
import type { KioskSettings } from '@photobooth/contracts';
import { APP_MODES } from '@photobooth/catalog';
import { db } from '@/server/db/client';
import { configEvents, kiosks } from '@/server/db/schema';
import { assertCan, type OrgContext } from '@/server/auth/context';
import { AppError } from '@/server/lib/errors';
import { ALWAYS_OWN, normalizeOwnSections, sourceLabel } from '@/lib/config-layers';
import { CONFIG_SECTIONS, resolvePermissions, type ConfigSectionId } from '@/lib/config-permissions';
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

const MODE_IDS = APP_MODES.map((m) => m.id) as [string, ...string[]];

export const QuickPatchSchema = z.object({
  mode: z.object({ appMode: z.enum(MODE_IDS) }).optional(),
  event: z.object({ title: z.string().max(80), subtitle: z.string().max(120), date: z.string().max(40) }).optional(),
  payment: z.object({ bypass: z.boolean() }).optional(),
  products: z.object({ photo: price, badge: price, bundle: price, ai: price }).optional(),
  print: z.object({ enabled: z.boolean(), photo: z.boolean(), badge: z.boolean(), queueSlip: z.boolean() }).optional(),
  templates: z.object({ photoLayouts: idList, photoDefaultLayout: z.string().min(1).max(64), badgeFrames: idList, badgeDefaultFrame: z.string().min(1).max(64) }).optional()
});
export type QuickPatch = z.infer<typeof QuickPatchSchema>;

export const QuickSaveInput = z.object({
  kioskRowId: z.string().max(32),
  /** 'source' = the kiosk's งาน / ค่ากลาง; 'kiosk' = this kiosk only (it then sets those sections itself). */
  target: z.enum(['source', 'kiosk']),
  /**
   * With 'source': sections this kiosk sets itself go to the layer too, and the kiosk follows the
   * layer for them again. Without it they stay on the kiosk (and the panel says so).
   */
  release: z.boolean().default(false),
  patch: QuickPatchSchema,
  note: z.string().trim().max(120).default('')
});

const SECTION_OF: Record<keyof QuickPatch, ConfigSectionId> = { mode: 'mode', event: 'brand', payment: 'payment', products: 'products', print: 'print', templates: 'templates' };

function applyPatch(s: KioskSettings, p: QuickPatch): KioskSettings {
  const out = structuredClone(s);
  if (p.mode) out.appMode = p.mode.appMode as KioskSettings['appMode'];
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
    .select({ id: kiosks.id, name: kiosks.name, own: kiosks.ownSections })
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
      mode: { appMode: s.appMode as string },
      event: { title: s.event.title, subtitle: s.event.subtitle, date: s.event.date },
      payment: { bypass: s.payment.bypass, enabled: s.payment.enabled },
      products: { photo: s.products.photo.price, badge: s.products.badge.price, bundle: s.products.bundle.price, ai: s.products.ai.price },
      print: { enabled: s.print.enabled, photo: s.print.photo, badge: s.print.badge, queueSlip: s.print.queueSlip },
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
  if (!parts.length) return { source: null, kiosk: null, released: [] as ConfigSectionId[] };
  const own = normalizeOwnSections(kiosk.ownSections);
  const note = `ตั้งค่าด่วนจาก Event Console${input.note ? `: ${input.note}` : ''}`;

  // Parts for the layer (unless the kiosk sets that section itself and it is not released, or
  // "this kiosk only")
  const toSource = input.target === 'source' ? parts.filter((k) => input.release || !own.includes(SECTION_OF[k])) : [];
  const toKiosk = parts.filter((k) => !toSource.includes(k));
  const released = input.release ? toSource.map((k) => SECTION_OF[k]).filter((id) => own.includes(id)) : [];
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
  if (toKiosk.length || released.length) {
    // Read again: the layer's save may already have given this kiosk a new revision
    const fresh = (await getKiosk(ctx, kiosk.id)).kiosk;
    const cur = await currentSettings(fresh);
    if (!cur) throw new AppError('ตู้นี้ยังไม่มีการตั้งค่า');
    const ownSections = [...new Set([...normalizeOwnSections(fresh.ownSections), ...toKiosk.map((k) => SECTION_OF[k])])].filter((id) => !released.includes(id));
    const r = await saveKioskConfig(ctx, kiosk.id, {
      baseRevision: cur.revision,
      settings: withoutPin(applyPatch(cur.settings, pick(toKiosk))),
      pin: { action: 'keep' },
      note,
      ownSections
    });
    kioskResult = { revision: r.revision };
  }
  return { source: sourceResult, kiosk: toKiosk.length ? kioskResult : null, released };
}

/** Event Studio › ตั้งค่างาน: the same parts, read from the event (or ค่ากลาง for "all kiosks"). */
export async function sourceQuickView(ctx: OrgContext, eventId: string | null) {
  assertCan(ctx, 'config.edit');
  const { source, settings: s } = await sourceFor(ctx.org.id, eventId);
  const followers = await followersOf(ctx, source.kind === 'event' ? source.id : null);
  const perms = resolvePermissions(ctx.org.configPermissions);
  // Kiosks that set a part themselves keep their own value
  const ownCount = Object.fromEntries((Object.values(SECTION_OF) as ConfigSectionId[]).map((id) => [id, followers.filter((k) => normalizeOwnSections(k.own).includes(id)).length]));
  return {
    values: {
      mode: { appMode: s.appMode as string },
      event: { title: s.event.title, subtitle: s.event.subtitle, date: s.event.date },
      payment: { bypass: s.payment.bypass, enabled: s.payment.enabled },
      products: { photo: s.products.photo.price, badge: s.products.badge.price, bundle: s.products.bundle.price, ai: s.products.ai.price },
      print: { enabled: s.print.enabled, photo: s.print.photo, badge: s.print.badge, queueSlip: s.print.queueSlip },
      templates: { photoLayouts: s.templates.photoLayouts, photoDefaultLayout: s.templates.photoDefaultLayout, badgeFrames: s.templates.badgeFrames, badgeDefaultFrame: s.templates.badgeDefaultFrame }
    },
    locked: ctx.principal.platformRole ? [] : (Object.values(SECTION_OF) as ConfigSectionId[]).filter((id) => perms[id] !== 'edit'),
    source: { label: sourceLabel(source), kind: source.kind, kiosks: followers.length },
    ownCount,
    /** Kiosks of this layer that set sections themselves (those don't follow this page). */
    owners: followers
      .map((k) => ({ id: k.id, name: k.name, sections: ownedSections(k.own) }))
      .filter((k) => k.sections.length),
    canSource: !!ctx.principal.platformRole || ctx.principal.branches === 'all'
  };
}

/** A kiosk's own sections that could follow a layer (name and location are always its own). */
const ownedSections = (own: readonly string[] | null) => normalizeOwnSections(own).filter((id) => !ALWAYS_OWN.includes(id));
const SECTION_LABEL = Object.fromEntries(CONFIG_SECTIONS.map((s) => [s.id, s.label])) as Record<ConfigSectionId, string>;
export const sectionLabels = (ids: readonly ConfigSectionId[]) => ids.map((id) => SECTION_LABEL[id] ?? id);

/**
 * A kiosk that sets sections itself goes back to following its งาน / ค่ากลาง for them.
 * 'adopt' = its current values become the layer's first (every kiosk of the layer gets them, this
 * one looks the same as now); 'follow' = it takes the layer's values (its own are dropped).
 * Sections the shop may not edit stay on the kiosk.
 */
export async function releaseKioskSections(ctx: OrgContext, kioskRowId: string, how: 'adopt' | 'follow') {
  const { kiosk } = await getKiosk(ctx, kioskRowId);
  assertCan(ctx, 'config.edit', { branchId: kiosk.branchId });
  if (!ctx.principal.platformRole && ctx.principal.branches !== 'all') throw new AppError('ใช้ค่าของงาน / ค่ากลางได้เฉพาะผู้ที่ดูแลทุกสาขา');
  const cur = await currentSettings(kiosk);
  if (!cur) throw new AppError('ตู้นี้ยังไม่มีการตั้งค่า');
  const perms = resolvePermissions(ctx.org.configPermissions);
  const owned = ownedSections(kiosk.ownSections);
  const { source, settings } = await sourceFor(ctx.org.id, kiosk.eventId);
  // The layer's admin PIN can't be set from a hash: a kiosk with its own PIN keeps 'behavior'
  // (adopting it would otherwise change the kiosk's PIN on the next save)
  const pinDiffers = (cur.settings.adminPin ?? null) !== (settings.adminPin ?? null);
  const ids = owned.filter((id) => (!!ctx.principal.platformRole || perms[id] === 'edit') && !(how === 'adopt' && id === 'behavior' && pinDiffers));
  if (!ids.length) return { label: '', sections: [] as ConfigSectionId[], kept: owned, kiosks: 0 };
  let kiosks = 0;
  if (how === 'adopt') {
    // The layer takes this kiosk's values for those sections, path by path
    const next = structuredClone(settings) as Record<string, unknown>;
    for (const section of CONFIG_SECTIONS) {
      if (!ids.includes(section.id)) continue;
      for (const path of section.paths) next[path] = structuredClone((cur.settings as Record<string, unknown>)[path]);
    }
    const note = `ใช้ค่าของตู้ ${kiosk.name} เป็นค่าของ${sourceLabel(source)}`;
    if (source.kind === 'event') {
      const ev = (await db().select({ updatedAt: configEvents.updatedAt }).from(configEvents).where(eq(configEvents.id, source.id)).limit(1))[0]!;
      kiosks = (await saveEventSettings(ctx, source.id, { baseUpdatedAt: ev.updatedAt.toISOString(), settings: withoutPin(next as KioskSettings), pin: { action: 'keep' }, note })).kiosks;
    } else {
      const d = await orgDefaults(ctx.org.id);
      kiosks = (await saveDefaults(ctx, { baseUpdatedAt: d.updatedAt ? d.updatedAt.toISOString() : null, settings: withoutPin(next as KioskSettings), pin: { action: 'keep' }, note })).kiosks;
    }
  }
  // Read again: the layer's save may have given the kiosk a new revision
  const fresh = (await getKiosk(ctx, kiosk.id)).kiosk;
  const now = await currentSettings(fresh);
  await saveKioskConfig(ctx, kiosk.id, {
    baseRevision: now!.revision,
    settings: withoutPin(now!.settings),
    pin: { action: 'keep' },
    note: how === 'adopt' ? 'ค่าของตู้กลายเป็นค่าของงาน / ค่ากลาง • ตู้ใช้ค่านั้นต่อ' : 'กลับไปใช้ค่าของงาน / ค่ากลาง',
    ownSections: normalizeOwnSections(fresh.ownSections).filter((id) => !ids.includes(id))
  });
  return { label: sourceLabel(source), sections: ids, kept: owned.filter((id) => !ids.includes(id)), kiosks };
}

export async function saveSourceQuick(ctx: OrgContext, eventId: string | null, patch: QuickPatch) {
  const parts = touched(patch);
  if (!parts.length) return { label: '', kiosks: 0 };
  const { source, settings } = await sourceFor(ctx.org.id, eventId);
  const next = withoutPin(applyPatch(settings, patch));
  const note = 'ตั้งค่างานจาก Event Studio';
  if (source.kind === 'event') {
    const ev = (await db().select({ updatedAt: configEvents.updatedAt }).from(configEvents).where(eq(configEvents.id, source.id)).limit(1))[0]!;
    const r = await saveEventSettings(ctx, source.id, { baseUpdatedAt: ev.updatedAt.toISOString(), settings: next, pin: { action: 'keep' }, note });
    return { label: sourceLabel(source), kiosks: r.kiosks };
  }
  const d = await orgDefaults(ctx.org.id);
  const r = await saveDefaults(ctx, { baseUpdatedAt: d.updatedAt ? d.updatedAt.toISOString() : null, settings: next, pin: { action: 'keep' }, note });
  return { label: sourceLabel(source), kiosks: r.kiosks };
}

/** Kiosk list / overview: switch one kiosk's mode (this kiosk only). */
export async function setKioskMode(ctx: OrgContext, kioskRowId: string, appMode: string, target: 'source' | 'kiosk' = 'kiosk') {
  return saveQuickSettings(ctx, QuickSaveInput.parse({ kioskRowId, target, patch: { mode: { appMode } }, note: 'เปลี่ยนโหมดตู้' }));
}

/** Kiosk list / page: where a kiosk's mode comes from (for the mode switch). */
export async function modeSourceOf(ctx: OrgContext, kiosk: { eventId: string | null; ownSections: string[] | null }) {
  const { source } = await sourceFor(ctx.org.id, kiosk.eventId);
  return {
    ownsMode: normalizeOwnSections(kiosk.ownSections).includes('mode'),
    label: sourceLabel(source),
    canSource: !!ctx.principal.platformRole || ctx.principal.branches === 'all'
  };
}

/**
 * ค่ากลาง / งาน editor: the kiosks of this layer that set `section` themselves go back to
 * following the layer for it (their own value of that section is dropped).
 */
export async function followLayer(ctx: OrgContext, eventId: string | null, section: ConfigSectionId) {
  assertCan(ctx, 'config.edit');
  if (section === 'identity') throw new AppError('ชื่อและสถานที่เป็นของแต่ละตู้เสมอ');
  const kiosksOfLayer = await followersOf(ctx, eventId);
  let changed = 0;
  for (const row of kiosksOfLayer) {
    const own = normalizeOwnSections(row.own);
    if (!own.includes(section)) continue;
    const { kiosk } = await getKiosk(ctx, row.id);
    const cur = await currentSettings(kiosk);
    if (!cur) continue;
    await saveKioskConfig(ctx, kiosk.id, {
      baseRevision: cur.revision,
      settings: withoutPin(cur.settings),
      pin: { action: 'keep' },
      note: 'กลับไปใช้ค่าของงาน / ค่ากลาง',
      ownSections: own.filter((id) => id !== section)
    });
    changed++;
  }
  return changed;
}
