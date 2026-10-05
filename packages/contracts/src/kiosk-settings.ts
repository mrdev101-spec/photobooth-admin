import { z } from 'zod';
import {
  APP_MODES,
  BADGE_SIZES,
  CLASSIC_TEMPLATES,
  PHOTO_LAYOUT_IDS,
  BADGE_FRAME_IDS,
  AI_SCENE_IDS
} from '@photobooth/catalog';
import { isUploadedTemplateId } from './templates';

/**
 * The settings document the Admin owns for one kiosk (GET /kiosk/config → `settings`).
 * Keys follow the kiosk's own config keys (photobooth-v1 src/services/configService.js).
 * Template ids are checked for shape here; whether an uploaded template exists and belongs
 * to the customer is checked by the Admin service when saving.
 */

const price = z.number().int().min(0).max(100_000);
const product = z.object({ sell: z.boolean(), price });
const hexColor = z.union([z.literal(''), z.string().regex(/^#[0-9a-fA-F]{6}$/)]);
const templateId = z.string().min(1).max(64);
/** A built-in id from `ids`, or an uploaded template (`tpl_…`, see templates.ts). */
const builtinOrUploaded = (ids: readonly string[]) =>
  z.string().refine((v) => ids.includes(v) || isUploadedTemplateId(v), 'ไม่พบ template นี้');

const modeIds = APP_MODES.map((m) => m.id) as [string, ...string[]];
const badgeSizeIds = BADGE_SIZES.map((s) => s.id) as [string, ...string[]];

export const AdminPinSchema = z.object({
  algo: z.literal('pbkdf2-sha256'),
  iterations: z.number().int().min(100_000),
  salt: z.string().min(16),
  hash: z.string().min(32)
});

// ─── Decorative text (the shop's own lines on a template) ──────────────────────

/** Fonts the kiosk can print (photobooth-v1 customTemplates.js TEXT_FONTS): Thai + English first. */
export const DECOR_FONTS = [
  'Sarabun', 'Prompt', 'Kanit', 'Trirong', 'Taviraj', 'Charmonman', 'Srisakdi', 'Mali', 'Sriracha', 'Chonburi',
  'Fredoka', 'Playfair Display', 'Caveat', 'Space Grotesk', 'Pacifico', 'Bangers', 'Courier Prime'
] as const;
export const DECOR_FIELDS = ['text', 'event.title', 'event.subtitle', 'event.date', 'brand.brandName'] as const;
export const DECOR_MAX_ITEMS = 8;

/**
 * One text line on a template, in the template's own units: a 4x6 photo is 1200 x 1800, a
 * badge 1000 x 1000 (the cut circle). Same shape as the kiosk's Config > ข้อความตกแต่ง.
 */
export const DecorTextSchema = z.object({
  field: z.enum(DECOR_FIELDS),
  text: z.string().max(120).default(''),
  x: z.number().min(-200).max(2000),
  y: z.number().min(-200).max(2000),
  maxWidth: z.number().min(20).max(2000),
  font: z.enum(DECOR_FONTS),
  weight: z.number().int().min(300).max(900).default(700),
  size: z.number().min(8).max(400),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  align: z.enum(['left', 'center', 'right']).default('center'),
  /** arc-top / arc-bottom: along the badge's circle (badges only) */
  path: z.enum(['line', 'arc-top', 'arc-bottom']).default('line'),
  stroke: hexColor.default(''),
  strokeWidth: z.number().min(0).max(40).default(0),
  shadow: z.boolean().default(false)
});
export type DecorText = z.infer<typeof DecorTextSchema>;

/** Template id → its lines. Built-in ids as in the catalog, uploaded templates as `tpl_…`. */
const decorKey = z.string().regex(/^(tpl_[A-Za-z0-9]+|[a-z0-9-]{1,40})$/, 'รหัส template ไม่ถูกต้อง');

// ─── A4 / A5 sheet layout (photo printer on sheet paper) ─────────────────────

export const SHEET_SLOT_ASPECTS = ['2:3', '9:16', '1:3', '3:4', '1:1'] as const;
const mm = z.number().min(0).max(420);

/**
 * Where 4x6 photos, badge areas and the queue number go on the sheet, in mm on the portrait
 * page (photobooth-v1 a4Sheet.js). null in the settings = the kiosk's preset layout.
 */
export const SheetLayoutSchema = z.object({
  photos: z
    .array(
      z.object({
        x: mm,
        y: mm,
        rotated: z.boolean().default(false),
        turn: z.enum(['cw', 'ccw']).default('cw'),
        scale: z.number().min(0.3).max(3).default(1),
        aspect: z.enum(SHEET_SLOT_ASPECTS).default('2:3')
      })
    )
    .max(6),
  zones: z.array(z.object({ x: mm, y: mm, w: z.number().min(10).max(420), h: z.number().min(10).max(420) })).max(8),
  photoSpare: z.enum(['repeat', 'blank']).default('repeat'),
  badgeSpare: z.enum(['repeat', 'blank']).default('blank'),
  queue: z.object({ x: mm, y: mm, show: z.boolean().default(true) })
});
export type SheetLayout = z.infer<typeof SheetLayoutSchema>;

/** Shape only (no cross-field checks) — use for .pick/.omit; validate with KioskSettingsSchema. */
export const KioskSettingsBaseSchema = z.object({
    appMode: z.enum(modeIds),
    identity: z.object({
      name: z.string().max(100),
      location: z.string().max(200),
      pickupStationName: z.string().max(100)
    }),
    products: z.object({
      photo: product,
      badge: product,
      bundle: product,
      classic: z.object(Object.fromEntries(CLASSIC_TEMPLATES.map((t) => [t.id, price])) as Record<(typeof CLASSIC_TEMPLATES)[number]['id'], typeof price>),
      ai: z.object({ price, allowRegenerate: z.boolean() })
    }),
    photoFulfillment: z.enum(['kiosk', 'pickup']),
    brand: z.object({
      brandName: z.string().max(60),
      photoTitle: z.string().max(80),
      photoTagline: z.string().max(160),
      /** The brand name printed on photos and badges ('none' = only the event text). */
      printBranding: z.enum(['brand', 'none'])
    }),
    event: z.object({
      preset: z.string().max(40),
      title: z.string().max(80),
      subtitle: z.string().max(120),
      date: z.string().max(40),
      accent: hexColor
    }),
    templates: z.object({
      photoLayouts: z.array(templateId).max(200),
      photoDefaultLayout: templateId,
      badgeFrames: z.array(templateId).max(200),
      badgeDefaultFrame: templateId,
      aiScenes: z.array(builtinOrUploaded(AI_SCENE_IDS)).max(200),
      classic: z.array(builtinOrUploaded(CLASSIC_TEMPLATES.map((t) => t.id))).max(200)
    }),
    badge: z.object({
      size: z.enum(badgeSizeIds),
      copies: z.number().int().min(1).max(12)
    }),
    /** What the kiosk prints (an order may still sell more, e.g. badges made at the staff desk). */
    print: z.object({
      /** Printing at all (every mode). Off = the customer gets the photo on screen + download QR. */
      enabled: z.boolean(),
      /** Shown on the last screen when nothing is printed (empty = the kiosk's own words). */
      noPrintNote: z.string().trim().max(160),
      photo: z.boolean(),
      badge: z.boolean(),
      queueSlip: z.boolean(),
      queuePrefix: z.string().regex(/^[A-Z0-9-]{0,3}$/, 'ตัวอักษร A-Z ตัวเลข หรือ - ไม่เกิน 3 ตัว'),
      queueOnPhoto: z.enum(['off', 'corner'])
    }),
    attract: z.object({ showBadges: z.boolean() }),
    /**
     * Defaults the kiosk may override on site (decision 2026-10-04 group C); the kiosk reports
     * its overrides in the heartbeat's localSettings.
     */
    sound: z.object({
      voiceGuide: z.boolean(),
      voiceVolume: z.number().int().min(0).max(200),
      musicOn: z.boolean(),
      musicTrack: z.enum(['kawaii', 'lofi']),
      musicVolume: z.number().int().min(0).max(200)
    }),
    paper: z.object({
      /** Classic receipt width; auto = the kiosk's printer profile. */
      classic: z.enum(['auto', '58mm', '80mm']),
      /**
       * AI Studio print: auto = by the kiosk's printer (as before); receipt = black-and-white on
       * the receipt printer; 4x6 = with the caption bar; 4x6-full = full bleed; a4 / a5 = the
       * 2:3 slot of the sheet layout, on the photo printer.
       */
      ai: z.enum(['auto', 'receipt', '4x6', '4x6-full', 'a4', 'a5']),
      photo: z.enum(['4x6', 'a4', 'a5']),
      badge: z.enum(['4x6', 'a4', 'with-photo']),
      /** Sheet layouts per paper size; null = the kiosk's preset. */
      a4Layout: SheetLayoutSchema.nullable(),
      a5Layout: SheetLayoutSchema.nullable()
    }),
    /** Decorative text per template (business: the event's look). */
    decor: z.record(decorKey, z.array(DecorTextSchema).max(DECOR_MAX_ITEMS)),
    payment: z.object({
      enabled: z.boolean(),
      /** Free use: the kiosk skips payment in every mode (logged as "ไม่เก็บเงิน"). */
      bypass: z.boolean(),
      mode: z.enum(['test', 'live']),
      email: z.union([z.literal(''), z.email()]),
      qrTimeoutSec: z.number().int().min(60).max(900)
    }),
    ai: z.object({ demoMode: z.boolean() }),
    share: z.object({
      enabled: z.boolean(),
      retentionDays: z.number().int().min(1).max(90)
    }),
    idleReturnSec: z.number().int().min(30).max(600),
    adminPin: AdminPinSchema.nullable()
  });

export const KioskSettingsSchema = KioskSettingsBaseSchema.superRefine((s, ctx) => {
    const { photoLayouts, photoDefaultLayout, badgeFrames, badgeDefaultFrame } = s.templates;
    // [] means "all published" (built-in + uploaded), so the default only has to be in an explicit list
    if (photoLayouts.length && !photoLayouts.includes(photoDefaultLayout)) {
      ctx.addIssue({ code: 'custom', path: ['templates', 'photoDefaultLayout'], message: 'แบบเริ่มต้นต้องอยู่ในรายการที่เปิดใช้' });
    }
    if (!photoLayouts.length && !PHOTO_LAYOUT_IDS.includes(photoDefaultLayout) && !isUploadedTemplateId(photoDefaultLayout)) {
      ctx.addIssue({ code: 'custom', path: ['templates', 'photoDefaultLayout'], message: 'ไม่พบแบบเริ่มต้นนี้' });
    }
    if (badgeFrames.length && !badgeFrames.includes(badgeDefaultFrame)) {
      ctx.addIssue({ code: 'custom', path: ['templates', 'badgeDefaultFrame'], message: 'กรอบเริ่มต้นต้องอยู่ในรายการที่เปิดใช้' });
    }
    if (!badgeFrames.length && !(BADGE_FRAME_IDS as readonly string[]).includes(badgeDefaultFrame) && !isUploadedTemplateId(badgeDefaultFrame)) {
      ctx.addIssue({ code: 'custom', path: ['templates', 'badgeDefaultFrame'], message: 'ไม่พบกรอบเริ่มต้นนี้' });
    }
  });

export type KioskSettings = z.infer<typeof KioskSettingsSchema>;

/** Revision 1 of a newly paired kiosk: the same values as the kiosk's DEFAULT_CONFIG. */
export function defaultKioskSettings(): KioskSettings {
  return {
    appMode: 'classic',
    identity: { name: '', location: '', pickupStationName: 'จุดรับรูป 1' },
    products: {
      photo: { sell: true, price: 99 },
      badge: { sell: false, price: 79 },
      bundle: { sell: false, price: 149 },
      classic: { newspaper: 40, receipt: 30, filmstrip: 50, polaroid: 35 },
      ai: { price: 69, allowRegenerate: true }
    },
    photoFulfillment: 'kiosk',
    brand: { brandName: 'scluo-dio', photoTitle: 'Photo Studio', photoTagline: 'ภาพสีคมชัด ขนาด 4x6 นิ้ว รับภาพทันที', printBranding: 'brand' },
    event: { preset: 'general', title: '', subtitle: '', date: '', accent: '' },
    templates: {
      photoLayouts: [],
      photoDefaultLayout: 'classic',
      badgeFrames: [],
      badgeDefaultFrame: 'ring',
      aiScenes: [],
      classic: []
    },
    badge: { size: '58', copies: 2 },
    print: { enabled: true, noPrintNote: '', photo: true, badge: true, queueSlip: true, queuePrefix: '', queueOnPhoto: 'off' },
    attract: { showBadges: true },
    sound: { voiceGuide: true, voiceVolume: 90, musicOn: true, musicTrack: 'kawaii', musicVolume: 40 },
    paper: { classic: 'auto', ai: 'auto', photo: '4x6', badge: '4x6', a4Layout: null, a5Layout: null },
    decor: {},
    payment: { enabled: false, bypass: false, mode: 'test', email: '', qrTimeoutSec: 180 },
    ai: { demoMode: false },
    share: { enabled: false, retentionDays: 7 },
    idleReturnSec: 120,
    adminPin: null
  };
}

const isPlainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function mergeDefaults(defaults: unknown, value: unknown): unknown {
  if (!isPlainObject(defaults)) return value === undefined ? defaults : value;
  if (!isPlainObject(value)) return value === undefined || value === null ? defaults : value;
  const out: Record<string, unknown> = { ...value };
  for (const [k, d] of Object.entries(defaults)) out[k] = mergeDefaults(d, value[k]);
  return out;
}

/**
 * A stored revision with every field present: revisions saved before a setting existed get
 * that setting's default (the same value the kiosk used before it was managed here).
 * `adminPin` stays as stored (null when missing).
 */
export function withSettingsDefaults(raw: unknown): KioskSettings {
  return mergeDefaults(defaultKioskSettings(), raw) as KioskSettings;
}
