import type { SheetLayout } from '@photobooth/contracts';

/*
 * A4 / A5 sheet geometry, ported from the kiosk (photobooth-v1 src/services/a4Sheet.js) so the
 * Admin editor shows the sheet the way the kiosk prints it. All values in mm, portrait page.
 */

export type SheetId = 'a4' | 'a5';
export const SHEET_SIZES = { a4: { id: 'a4', name: 'A4', w: 210, h: 297 }, a5: { id: 'a5', name: 'A5', w: 148, h: 210 } } as const;
type Size = (typeof SHEET_SIZES)[SheetId];
export const PHOTO_MM = { w: 101.6, h: 152.4 };
export const QUEUE_BOX_MM = { w: 34, h: 10 };
/** The margin the kiosk uses for a printer that is not borderless (Canon G3010 on A4). */
export const DEFAULT_MARGIN = 3.4;
const GAP_MM = 3;
const BADGE_GAP_MM = 2;

export const SLOT_ASPECTS = [
  { id: '2:3', name: '4x6 (2:3)', r: 2 / 3 },
  { id: '9:16', name: '9:16', r: 9 / 16 },
  { id: '1:3', name: 'แถบ 2x6 (1:3)', r: 1 / 3 },
  { id: '3:4', name: '3:4', r: 3 / 4 },
  { id: '1:1', name: 'จัตุรัส (1:1)', r: 1 }
] as const;
type Photo = SheetLayout['photos'][number];
const aspectOf = (p: Pick<Photo, 'aspect'>) => SLOT_ASPECTS.find((a) => a.id === p.aspect) ?? SLOT_ASPECTS[0];
const round1 = (v: number) => Math.round(v * 10) / 10;
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** A photo slot's box: 152.4 mm tall x its scale, as wide as its shape, turned when rotated. */
export function photoRect(p: Photo) {
  const k = p.scale > 0 ? p.scale : 1;
  const h = Math.round(PHOTO_MM.h * k * 100) / 100;
  const w = Math.round(PHOTO_MM.h * aspectOf(p).r * k * 100) / 100;
  return { x: p.x, y: p.y, w: p.rotated ? h : w, h: p.rotated ? w : h };
}

/** Largest scale at which a photo slot still fits inside the margins of the sheet. */
export function maxPhotoScale(size: Size, margin: number, rotated = false, aspect: Photo['aspect'] = '2:3') {
  const r = (SLOT_ASPECTS.find((a) => a.id === aspect) ?? SLOT_ASPECTS[0]).r;
  const w = rotated ? PHOTO_MM.h : PHOTO_MM.h * r;
  const h = rotated ? PHOTO_MM.h * r : PHOTO_MM.h;
  return Math.floor(Math.min((size.w - 2 * margin) / w, (size.h - 2 * Math.max(margin, 5)) / h) * 1000) / 1000;
}

export const defaultQueueBox = (margin: number, size: Size) => ({ x: round1(size.w - Math.max(margin, 3.5) - QUEUE_BOX_MM.w), y: round1(size.h - Math.max(margin, 5) - QUEUE_BOX_MM.h) });

export const SHEET_PRESETS: Record<SheetId, { id: string; name: string }[]> = {
  a4: [
    { id: 'two-badges', name: 'ภาพ 2 ใบด้านบน + เข็มกลัดด้านล่าง' },
    { id: 'one-badges', name: 'ภาพ 1 ใบ + เข็มกลัดรอบ ๆ' },
    { id: 'three', name: 'ภาพ 3 ใบ (ตั้ง 2 + นอน 1)' },
    { id: 'badges', name: 'เข็มกลัดเต็มแผ่น' }
  ],
  a5: [
    { id: 'a5-one', name: 'ภาพ 4x6 ขนาดจริง กึ่งกลางแผ่น' },
    { id: 'a5-fill', name: 'ภาพขยายเต็มแผ่น A5' },
    { id: 'a5-photo-badges', name: 'ภาพย่อ 85% + เข็มกลัดด้านล่าง' },
    { id: 'a5-strips-badges', name: 'แถบ 2x6 แนวนอน 2 แถบ + เข็มกลัดด้านล่าง' },
    { id: 'a5-916-two', name: 'ภาพ 9:16 แนวนอน 2 ภาพ' },
    { id: 'a5-916', name: 'ภาพ 9:16 เต็มความสูงแผ่น' },
    { id: 'a5-strips', name: 'แถบ 2x6 แนวตั้ง 2 แถบ' },
    { id: 'badges', name: 'เข็มกลัดเต็มแผ่น' }
  ]
};

type Part = { photos: Partial<Photo>[]; zones: SheetLayout['zones']; photoSpare?: SheetLayout['photoSpare']; queue?: SheetLayout['queue'] };

function presetPart(id: string, m: number, size: Size): Part {
  if (size.id === 'a5') {
    const bottomEdge = size.h - Math.max(m, 5);
    const centred = (k: number, y: number) => ({ x: round1((size.w - PHOTO_MM.w * k) / 2), y: round1(y), rotated: false, scale: k });
    const q = defaultQueueBox(m, size);
    const besideQueue = q.x - GAP_MM;
    const aboveQueue = q.y - GAP_MM;
    switch (id) {
      case 'a5-strips-badges': {
        const k = Math.floor(((size.w - 2 * m) / PHOTO_MM.h) * 1000) / 1000;
        const sh = (PHOTO_MM.h * k) / 3;
        const photos = [0, 1].map((i) => ({ x: m, y: round1(m + i * (sh + GAP_MM)), rotated: true, turn: 'ccw' as const, scale: k, aspect: '1:3' as const }));
        const below = m + 2 * sh + 2 * GAP_MM;
        return { photos, zones: [{ x: m, y: round1(below), w: round1(size.w - 2 * m), h: round1(aboveQueue - below) }], photoSpare: 'repeat' };
      }
      case 'a5-916-two': {
        const k = Math.floor(((size.w - 2 * m) / PHOTO_MM.h) * 1000) / 1000;
        const sh = (PHOTO_MM.h * k * 9) / 16;
        return { photos: [0, 1].map((i) => ({ x: m, y: round1(m + i * (sh + GAP_MM)), rotated: true, turn: 'cw' as const, scale: k, aspect: '9:16' as const })), zones: [], photoSpare: 'repeat' };
      }
      case 'a5-916': {
        const k = maxPhotoScale(size, m, false, '9:16');
        const w = (PHOTO_MM.h * k * 9) / 16;
        return { photos: [{ x: round1((size.w - w) / 2), y: round1((size.h - PHOTO_MM.h * k) / 2), rotated: false, scale: k, aspect: '9:16' }], zones: [], queue: { ...q, show: false } };
      }
      case 'a5-strips': {
        const k = Math.min(maxPhotoScale(size, m, false, '1:3'), (size.h - 2 * Math.max(m, 5)) / PHOTO_MM.h);
        const w = (PHOTO_MM.h * k) / 3;
        const x0 = (size.w - 2 * w - GAP_MM) / 2;
        const y = round1((size.h - PHOTO_MM.h * k) / 2);
        return { photos: [0, 1].map((i) => ({ x: round1(x0 + i * (w + GAP_MM)), y, rotated: false, scale: k, aspect: '1:3' as const })), zones: [], queue: { ...q, show: false }, photoSpare: 'repeat' };
      }
      case 'a5-fill': {
        const k = maxPhotoScale(size, m);
        return { photos: [centred(k, (size.h - PHOTO_MM.h * k) / 2)], zones: [], queue: { ...q, show: false } };
      }
      case 'a5-photo-badges': {
        const k = 0.85;
        const below = m + PHOTO_MM.h * k + GAP_MM;
        return { photos: [centred(k, m)], zones: [{ x: m, y: round1(below), w: round1(besideQueue - m), h: round1(bottomEdge - below) }] };
      }
      case 'badges':
        return { photos: [], zones: [{ x: m, y: m, w: round1(size.w - 2 * m), h: round1(aboveQueue - m) }] };
      default: {
        const below = m + PHOTO_MM.h + GAP_MM;
        return { photos: [centred(1, m)], zones: [{ x: m, y: round1(below), w: round1(besideQueue - m), h: round1(bottomEdge - below) }] };
      }
    }
  }
  const A4 = SHEET_SIZES.a4;
  const x2 = (A4.w - 2 * PHOTO_MM.w - Math.max(0, Math.min(GAP_MM, A4.w - 2 * m - 2 * PHOTO_MM.w))) / 2;
  const right = A4.w - m;
  const bottom = A4.h - Math.max(m, 5);
  const twoTop = [
    { x: x2, y: m, rotated: false },
    { x: A4.w - x2 - PHOTO_MM.w, y: m, rotated: false }
  ];
  const below = m + PHOTO_MM.h + GAP_MM;
  switch (id) {
    case 'one-badges':
      return { photos: [{ x: m, y: m, rotated: false }], zones: [{ x: m + PHOTO_MM.w + GAP_MM, y: m, w: right - (m + PHOTO_MM.w + GAP_MM), h: bottom - m }, { x: m, y: below, w: PHOTO_MM.w, h: bottom - below }] };
    case 'three':
      return { photos: [...twoTop, { x: x2, y: below, rotated: true }], zones: [] };
    case 'badges':
      return { photos: [], zones: [{ x: m, y: m, w: right - m, h: bottom - m }] };
    default:
      return { photos: twoTop, zones: [{ x: m, y: below, w: right - m, h: bottom - below }] };
  }
}

/** A clean layout (positions kept on the paper), like the kiosk's a4Layout(). */
export function normalizeLayout(raw: Part & { badgeSpare?: SheetLayout['badgeSpare'] }, sheet: SheetId, margin = DEFAULT_MARGIN): SheetLayout {
  const size = SHEET_SIZES[sheet];
  const photos = raw.photos.slice(0, 6).map((p) => {
    const aspect = (SLOT_ASPECTS.find((a) => a.id === p.aspect) ?? SLOT_ASPECTS[0]).id;
    const rotated = !!p.rotated;
    const scale = Math.round(clamp(Number(p.scale) > 0 ? Number(p.scale) : 1, 0.3, Math.max(1, maxPhotoScale(size, 0, rotated, aspect))) * 1000) / 1000;
    const r = photoRect({ x: 0, y: 0, rotated, turn: 'cw', scale, aspect });
    return { x: round1(clamp(Number(p.x) || 0, 0, size.w - r.w)), y: round1(clamp(Number(p.y) || 0, 0, size.h - r.h)), rotated, turn: p.turn === 'ccw' ? ('ccw' as const) : ('cw' as const), scale, aspect };
  });
  const zones = raw.zones.slice(0, 8).map((z) => ({
    x: round1(clamp(z.x, 0, size.w - 10)),
    y: round1(clamp(z.y, 0, size.h - 10)),
    w: round1(clamp(z.w, 10, size.w)),
    h: round1(clamp(z.h, 10, size.h))
  }));
  const q = raw.queue ?? { ...defaultQueueBox(margin, size), show: true };
  return {
    photos,
    zones,
    photoSpare: raw.photoSpare === 'blank' ? 'blank' : 'repeat',
    badgeSpare: raw.badgeSpare === 'repeat' ? 'repeat' : 'blank',
    queue: { x: round1(clamp(q.x, 0, size.w - QUEUE_BOX_MM.w)), y: round1(clamp(q.y, 0, size.h - QUEUE_BOX_MM.h)), show: q.show !== false }
  };
}

export function layoutPreset(id: string, sheet: SheetId, margin = DEFAULT_MARGIN): SheetLayout {
  const part = presetPart(id, margin, SHEET_SIZES[sheet]);
  return normalizeLayout({ ...part, badgeSpare: 'blank', photoSpare: part.photoSpare ?? 'repeat' }, sheet, margin);
}

/** What the kiosk prints when the Admin has no layout for the sheet (null). */
export const kioskDefaultLayout = (sheet: SheetId) => layoutPreset(sheet === 'a5' ? 'a5-one' : 'two-badges', sheet);

/** Badge circle centres in a zone (diameter d = the badge's cut size). */
export function zoneSpots(z: { x: number; y: number; w: number; h: number }, d: number) {
  const fit = (len: number) => {
    const n = Math.floor((len + BADGE_GAP_MM) / (d + BADGE_GAP_MM));
    const tight = Math.floor((len + 0.8) / (d + 0.8));
    if (tight > n && tight > 1) return { n: tight, gap: Math.min(BADGE_GAP_MM, (len - tight * d) / (tight - 1)) };
    return { n, gap: BADGE_GAP_MM };
  };
  const { n: cols, gap: gx } = fit(z.w);
  const { n: rows, gap: gy } = fit(z.h);
  if (cols < 1 || rows < 1) return [];
  const x0 = z.x + (z.w - (cols * (d + gx) - gx)) / 2;
  const y0 = z.y + (z.h - (rows * (d + gy) - gy)) / 2;
  const out: { cx: number; cy: number }[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push({ cx: x0 + c * (d + gx) + d / 2, cy: y0 + r * (d + gy) + d / 2 });
  return out;
}

/** Slots outside the printable area or on top of each other (editor warnings). */
export function layoutProblems(layout: SheetLayout, sheet: SheetId, margin = DEFAULT_MARGIN) {
  const size = SHEET_SIZES[sheet];
  const items = [...layout.photos.map(photoRect), ...layout.zones, ...(layout.queue.show ? [{ ...layout.queue, ...QUEUE_BOX_MM }] : [])];
  const out: { i: number; j?: number; kind: 'edge' | 'overlap' }[] = [];
  items.forEach((a, i) => {
    if (a.x < margin - 0.05 || a.y < margin - 0.05 || a.x + a.w > size.w - margin + 0.05 || a.y + a.h > size.h - margin + 0.05) out.push({ i, kind: 'edge' });
    items.forEach((b, j) => {
      if (j > i && a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) out.push({ i, j, kind: 'overlap' });
    });
  });
  return out;
}
