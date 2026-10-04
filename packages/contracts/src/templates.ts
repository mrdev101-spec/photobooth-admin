import { z } from 'zod';
import { PHOTO_FILTERS } from '@photobooth/catalog';

/**
 * Uploaded templates (kiosk docs WEB_ADMIN_INTEGRATION.md "รูปแบบ Template"): an overlay PNG with
 * transparent photo windows + a slot file the platform draws in the Admin. Built-in templates
 * stay code-drawn on the kiosk. Uploaded ids always start with `tpl_` so they can never collide
 * with built-in ids.
 */

export const UPLOADED_TEMPLATE_KINDS = ['photo-4x6', 'badge', 'classic', 'ai-scene'] as const;
export type UploadedTemplateKind = (typeof UPLOADED_TEMPLATE_KINDS)[number];

export const UPLOADED_ID_PATTERN = /^tpl_[a-z0-9][a-z0-9_-]{1,58}$/;
export const isUploadedTemplateId = (id: string) => UPLOADED_ID_PATTERN.test(id);

/** Fonts every kiosk ships (Thai text always falls back to Sarabun). */
export const TEMPLATE_FONTS = ['Sarabun', 'Fredoka', 'Playfair Display', 'Caveat', 'Space Grotesk', 'Pacifico', 'Bangers'] as const;

/** Text the kiosk fills in at print time. */
export const TEMPLATE_TEXT_FIELDS = ['event.title', 'event.subtitle', 'event.date', 'brand.brandName'] as const;

/** Canvas rules per kind (px). Classic height is free, within limits. */
export const TEMPLATE_CANVAS = {
  // 1200 x 1800 is the 4x6 print; other shapes (2x6 strip 600 x 1800, 9:16 1013 x 1800...) are
  // placed on A4 / A5 sheets by the kiosk, so any size from minSide to maxSide is accepted
  'photo-4x6': { widths: [1200], height: 1800, minSide: 300, maxSide: 1800, bleed: 36, safe: 60, maxPhotoSlots: 4 },
  badge: { widths: [1000], height: 1000, bleed: 0, safe: 0, maxPhotoSlots: 1 },
  classic: { widths: [576, 384], height: null, minHeight: 300, maxHeight: 4000, bleed: 0, safe: 16, maxPhotoSlots: 4 }
} as const;

export const MAX_OVERLAY_BYTES = 8 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

const px = z.number().int().min(-2000).max(8000);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'สีต้องเป็น #RRGGBB');

export const AssetRefSchema = z.object({
  url: z.string().max(1000),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  bytes: z.number().int().positive().optional()
});
export type AssetRef = z.infer<typeof AssetRefSchema>;

export const RectSlotSchema = z.object({
  x: px,
  y: px,
  w: z.number().int().min(20).max(8000),
  h: z.number().int().min(20).max(8000),
  radius: z.number().int().min(0).max(2000).default(0),
  rotate: z.number().min(-45).max(45).default(0),
  focus: z.enum(['face', 'center']).default('face')
});

export const CircleSlotSchema = z.object({
  shape: z.literal('circle'),
  cx: px,
  cy: px,
  r: z.number().int().min(20).max(2000),
  focus: z.enum(['face', 'center']).default('face')
});

export const TextSlotSchema = z
  .object({
    field: z.enum(TEMPLATE_TEXT_FIELDS).optional(),
    text: z.string().max(120).optional(),
    x: px,
    y: px,
    maxWidth: z.number().int().min(20).max(8000),
    font: z.enum(TEMPLATE_FONTS),
    weight: z.union([z.literal(400), z.literal(500), z.literal(600), z.literal(700), z.literal(800)]).default(700),
    size: z.number().int().min(8).max(400),
    minSize: z.number().int().min(8).max(400).optional(),
    color,
    align: z.enum(['left', 'center', 'right']).default('center'),
    letterSpacing: z.number().min(0).max(60).default(0),
    path: z.enum(['straight', 'arc-top', 'arc-bottom']).default('straight')
  })
  .refine((t) => !!t.field !== !!t.text, { message: 'ช่องข้อความต้องเลือกข้อมูล หรือพิมพ์ข้อความคงที่ อย่างใดอย่างหนึ่ง' });
export type TextSlot = z.infer<typeof TextSlotSchema>;

const FILTER_IDS = PHOTO_FILTERS.map((f) => f.id) as [string, ...string[]];

/** What the platform edits for a frame template (photo-4x6 / badge / classic). */
export const FrameSpecSchema = z.object({
  background: color.default('#FFFFFF'),
  photoSlots: z.array(z.union([RectSlotSchema, CircleSlotSchema])).min(1, 'ต้องมีช่องรูปอย่างน้อย 1 ช่อง').max(4),
  textSlots: z.array(TextSlotSchema).max(8).default([]),
  defaultFilter: z.enum(FILTER_IDS).default('natural')
});
export type FrameSpec = z.infer<typeof FrameSpecSchema>;

/** AI poster scene: reference images live in `files`, the prompt is used by the Admin's AI calls. */
export const AiSceneSpecSchema = z.object({
  prompt: z.string().trim().min(20, 'คำอธิบายฉากสั้นเกินไป').max(4000),
  baseGender: z.enum(['female', 'male', 'any']).default('any'),
  accent: color.default('#C8102E')
});
export type AiSceneSpec = z.infer<typeof AiSceneSpecSchema>;

export type TemplateSpec = FrameSpec | AiSceneSpec;

/** Files of one version: frames need `overlay`; AI scenes need `plate` (+ optional samples). */
export interface TemplateFiles {
  overlay?: AssetRef;
  sample?: AssetRef;
  preview?: AssetRef;
  plate?: AssetRef;
  female?: AssetRef;
  male?: AssetRef;
}

/** Problems that block publishing a frame version. */
export function frameIssues(kind: Exclude<UploadedTemplateKind, 'ai-scene'>, spec: FrameSpec, overlay?: { width?: number; height?: number }): string[] {
  const issues: string[] = [];
  const rules = TEMPLATE_CANVAS[kind];
  if (!overlay?.width || !overlay.height) return ['ยังไม่ได้อัปโหลดภาพกรอบ (PNG)'];
  const W = overlay.width;
  const H = overlay.height;
  if (spec.photoSlots.length > rules.maxPhotoSlots) issues.push(`ช่องรูปได้ไม่เกิน ${rules.maxPhotoSlots} ช่อง`);
  spec.photoSlots.forEach((s, i) => {
    const n = i + 1;
    if ('shape' in s) {
      if (kind !== 'badge') issues.push(`ช่องรูป ${n}: ช่องวงกลมใช้ได้เฉพาะเข็มกลัด`);
      if (s.cx - s.r < 0 || s.cy - s.r < 0 || s.cx + s.r > W || s.cy + s.r > H) issues.push(`ช่องรูป ${n} ล้นขอบภาพ`);
    } else {
      if (kind === 'badge') issues.push(`ช่องรูป ${n}: เข็มกลัดใช้ช่องวงกลม`);
      if (s.x < -rules.bleed || s.y < -rules.bleed || s.x + s.w > W + rules.bleed || s.y + s.h > H + rules.bleed) issues.push(`ช่องรูป ${n} ล้นขอบภาพ`);
    }
  });
  spec.textSlots.forEach((t, i) => {
    const half = t.align === 'center' ? t.maxWidth / 2 : 0;
    const left = t.align === 'center' ? t.x - half : t.align === 'right' ? t.x - t.maxWidth : t.x;
    if (left < rules.safe || left + t.maxWidth > W - rules.safe || t.y < rules.safe || t.y > H - rules.safe) issues.push(`ช่องข้อความ ${i + 1} อยู่นอกพื้นที่ปลอดภัย (${rules.safe}px จากขอบ)`);
    if (t.minSize && t.minSize > t.size) issues.push(`ช่องข้อความ ${i + 1}: ขนาดเล็กสุดต้องไม่เกินขนาดปกติ`);
  });
  return issues;
}

/** Problems with an uploaded overlay's pixel size for its kind. */
export function overlaySizeIssue(kind: Exclude<UploadedTemplateKind, 'ai-scene'>, width: number, height: number): string | null {
  const r = TEMPLATE_CANVAS[kind];
  if ('minSide' in r) {
    const bad = (v: number) => !Number.isInteger(v) || v < r.minSide || v > r.maxSide;
    return bad(width) || bad(height) ? `ด้านกว้างและสูงต้องอยู่ระหว่าง ${r.minSide}-${r.maxSide} px (ไฟล์นี้ ${width} × ${height} px) • ภาพ 4x6 คือ 1200 × 1800` : null;
  }
  if (!(r.widths as readonly number[]).includes(width)) return `ความกว้างต้องเป็น ${r.widths.join(' หรือ ')} px (ไฟล์นี้ ${width} px)`;
  if (r.height !== null && height !== r.height) return `ความสูงต้องเป็น ${r.height} px (ไฟล์นี้ ${height} px)`;
  if (r.height === null && (height < r.minHeight || height > r.maxHeight)) return `ความสูงต้องอยู่ระหว่าง ${r.minHeight}-${r.maxHeight} px`;
  return null;
}

// ─── Kiosk: GET /kiosk/assets/manifest ──────────────────────────────────────

export interface ManifestTemplate {
  id: string;
  version: number;
  kind: UploadedTemplateKind;
  name: string;
  desc: string;
  tags: string[];
  /** Frames: overlay/sample/preview. AI scenes: plate/female/male/preview. URLs are absolute. */
  files: TemplateFiles;
  /** FrameSpec fields for frames (background, photoSlots, textSlots, defaultFilter); AiSceneSpec for AI scenes. */
  spec: TemplateSpec;
}

export interface AssetManifestResponse {
  revision: number;
  generatedAt: string;
  /** Every published uploaded template. Templates missing here are retired: drop them. */
  templates: ManifestTemplate[];
}
