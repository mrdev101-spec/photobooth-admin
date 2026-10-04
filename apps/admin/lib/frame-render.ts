import type { FrameSpec, TextSlot } from '@photobooth/contracts';

/**
 * Browser renderer for uploaded frame templates (overlay PNG + slot file), following the kiosk
 * spec: background → customer photos in their slots → overlay on top → live text. Used for the
 * editor preview and the catalog preview image. The kiosk team will ship the shared renderer
 * (WEB_ADMIN_INTEGRATION.md); until then this mirrors the spec.
 */

// Same CSS filters as the kiosk (photoLayouts.js PHOTO_FILTERS)
export const FILTER_CSS: Record<string, string> = {
  natural: 'none',
  bright: 'brightness(1.07) contrast(1.06) saturate(1.18)',
  warm: 'sepia(0.16) saturate(1.12) brightness(1.04) contrast(1.02)',
  cool: 'hue-rotate(-8deg) saturate(1.05) brightness(1.04) contrast(1.04)',
  vintage: 'sepia(0.38) contrast(0.92) brightness(1.05) saturate(0.85)',
  mono: 'grayscale(1) contrast(1.12) brightness(1.03)'
};

export interface FrameTexts {
  'event.title': string;
  'event.subtitle': string;
  'event.date': string;
  'brand.brandName': string;
}

export const SAMPLE_TEXTS: FrameTexts = {
  'event.title': 'SUMMER FEST 2026',
  'event.subtitle': 'ขอบคุณที่มาร่วมงาน',
  'event.date': new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase(),
  'brand.brandName': 'SCLUO-DIO PHOTO BOOTH'
};

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`โหลดภาพไม่ได้: ${src}`));
    img.src = src;
  });
}

/** Cover-fit, crop a little above centre so heads stay in (same rule as the kiosk). */
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (img.naturalWidth - sw) / 2;
  const sy = Math.max(0, Math.min(img.naturalHeight - sh, (img.naturalHeight - sh) * 0.35));
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function fontString(t: TextSlot, size: number) {
  return `${t.weight} ${size}px '${t.font}', 'Sarabun', sans-serif`;
}

function drawText(ctx: CanvasRenderingContext2D, t: TextSlot, value: string, canvasW: number, canvasH: number) {
  if (!value) return;
  let size = t.size;
  const min = t.minSize ?? t.size;
  ctx.font = fontString(t, size);
  const spacing = t.letterSpacing ?? 0;
  const measure = () => ctx.measureText(value).width + spacing * Math.max(0, value.length - 1);
  while (measure() > t.maxWidth && size > min) {
    size -= 1;
    ctx.font = fontString(t, size);
  }
  ctx.fillStyle = t.color;
  ctx.textBaseline = 'alphabetic';
  if (t.path === 'arc-top' || t.path === 'arc-bottom') {
    drawArcText(ctx, value, t, canvasW / 2, canvasH / 2, spacing);
    return;
  }
  // letterSpacing is supported by modern canvases; fall back to plain text otherwise
  (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${spacing}px`;
  ctx.textAlign = t.align;
  ctx.fillText(value, t.x, t.y);
  (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '0px';
}

/** Text along a circle around the badge centre; radius = distance from centre to (x, y). */
function drawArcText(ctx: CanvasRenderingContext2D, value: string, t: TextSlot, cx: number, cy: number, spacing: number) {
  const r = Math.max(10, Math.hypot(t.x - cx, t.y - cy));
  const top = t.path === 'arc-top';
  const chars = [...value];
  const widths = chars.map((c) => ctx.measureText(c).width + spacing);
  const total = widths.reduce((a, b) => a + b, 0) - spacing;
  let angle = (top ? -Math.PI / 2 : Math.PI / 2) + ((top ? -1 : 1) * total) / 2 / r;
  ctx.textAlign = 'center';
  for (let i = 0; i < chars.length; i++) {
    const half = widths[i]! / 2;
    angle += ((top ? 1 : -1) * half) / r;
    ctx.save();
    ctx.translate(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
    ctx.rotate(angle + (top ? Math.PI / 2 : -Math.PI / 2));
    ctx.fillText(chars[i]!, 0, top ? 0 : ctx.measureText('M').width * 0.8);
    ctx.restore();
    angle += ((top ? 1 : -1) * half) / r;
  }
}

export interface RenderInput {
  width: number;
  height: number;
  spec: FrameSpec;
  overlay: HTMLImageElement | null;
  photos: HTMLImageElement[];
  texts?: FrameTexts;
  /** Thermal receipts print black and white. */
  mono?: boolean;
}

export async function renderFrame(canvas: HTMLCanvasElement, input: RenderInput): Promise<void> {
  const { width: W, height: H, spec } = input;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  await Promise.all(spec.textSlots.map((t) => document.fonts.load(fontString(t, t.size)).catch(() => null)));
  ctx.save();
  ctx.fillStyle = spec.background;
  ctx.fillRect(0, 0, W, H);
  const filter: string = (input.mono ? FILTER_CSS.mono : FILTER_CSS[spec.defaultFilter]) ?? 'none';
  spec.photoSlots.forEach((slot, i) => {
    const img = input.photos.length ? input.photos[i % input.photos.length]! : null;
    ctx.save();
    ctx.beginPath();
    if ('shape' in slot) {
      ctx.arc(slot.cx, slot.cy, slot.r, 0, Math.PI * 2);
      ctx.clip();
      ctx.filter = filter;
      if (img) drawCover(ctx, img, slot.cx - slot.r, slot.cy - slot.r, slot.r * 2, slot.r * 2);
    } else {
      const cx = slot.x + slot.w / 2;
      const cy = slot.y + slot.h / 2;
      ctx.translate(cx, cy);
      ctx.rotate(((slot.rotate ?? 0) * Math.PI) / 180);
      ctx.roundRect(-slot.w / 2, -slot.h / 2, slot.w, slot.h, slot.radius ?? 0);
      ctx.clip();
      ctx.filter = filter;
      if (img) drawCover(ctx, img, -slot.w / 2, -slot.h / 2, slot.w, slot.h);
      else {
        ctx.fillStyle = '#d4d4d8';
        ctx.fillRect(-slot.w / 2, -slot.h / 2, slot.w, slot.h);
      }
    }
    ctx.restore();
  });
  if (input.overlay) ctx.drawImage(input.overlay, 0, 0, W, H);
  const texts = input.texts ?? SAMPLE_TEXTS;
  for (const t of spec.textSlots) drawText(ctx, t, t.text ?? (t.field ? texts[t.field] : ''), W, H);
  ctx.restore();
  if (input.mono) {
    // Whole receipt in grey, as the thermal printer will
    const data = ctx.getImageData(0, 0, W, H);
    const d = data.data;
    for (let i = 0; i < d.length; i += 4) {
      const g = 0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!;
      d[i] = d[i + 1] = d[i + 2] = g;
    }
    ctx.putImageData(data, 0, 0);
  }
}

/** A small JPEG of the canvas for the catalog card. */
export function previewBlob(source: HTMLCanvasElement, width = 480): Promise<Blob> {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = Math.round((source.height / source.width) * width);
  c.getContext('2d')!.drawImage(source, 0, 0, c.width, c.height);
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('สร้างภาพตัวอย่างไม่ได้'))), 'image/jpeg', 0.85));
}
