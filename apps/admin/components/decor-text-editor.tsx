'use client';

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import clsx from 'clsx';
import { Copy, Plus, Trash2 } from 'lucide-react';
import { DECOR_FONTS, DECOR_MAX_ITEMS, type DecorText } from '@photobooth/contracts';

/**
 * Config > ข้อความตกแต่ง in the Admin: the shop's own text lines on a template, drawn the way the
 * kiosk draws them (photobooth-v1 customTemplates.js drawTextSlots / badgeLayouts.js arcText).
 * A 4x6 is 1200 x 1800 units, a badge 1000 x 1000 (the cut circle); lines are dragged on the preview.
 */

export interface DecorTemplate {
  id: string;
  name: string;
  image?: string;
}

type Kind = 'photo-4x6' | 'badge';
const UNITS: Record<Kind, { w: number; h: number }> = { 'photo-4x6': { w: 1200, h: 1800 }, badge: { w: 1000, h: 1000 } };
const STAGE_W = 320;

const FONT_LABELS: Record<string, string> = {
  Sarabun: 'สารบรรณ', Prompt: 'พร้อมท์', Kanit: 'คณิต', Trirong: 'ตรีรงค์ (มีเชิง)', Taviraj: 'ทวิราช (มีเชิง)',
  Charmonman: 'ชามนมาน (ลายมือ)', Srisakdi: 'ศรีศักดิ์ (ไทยประดิษฐ์)', Mali: 'มะลิ (กลมมน)', Sriracha: 'ศรีราชา (ลายมือ)', Chonburi: 'ชลบุรี (หัวโต)'
};
const SINGLE_WEIGHT = new Set(['Sriracha', 'Chonburi', 'Pacifico', 'Bangers']);
const FIELDS = [
  { id: 'text', name: 'พิมพ์ข้อความเอง' },
  { id: 'event.title', name: 'ชื่องาน (จากแบรนด์และธีมงาน)' },
  { id: 'event.subtitle', name: 'ข้อความรอง (จากแบรนด์และธีมงาน)' },
  { id: 'event.date', name: 'วันที่' },
  { id: 'brand.brandName', name: 'ชื่อร้าน' }
] as const;
const SWATCHES = ['#FFFFFF', '#1F1B24', '#C9A45C', '#F48FC2', '#FF3CAC', '#6D4FE0', '#2563EB', '#14B8A6', '#22C55E', '#F59E0B', '#C0392B'];

const GOOGLE_FONTS_URL =
  'https://fonts.googleapis.com/css2?' +
  DECOR_FONTS.map((f) => `family=${f.replace(/ /g, '+')}${SINGLE_WEIGHT.has(f) ? '' : ':wght@400;700'}`).join('&') +
  '&display=swap';

const weightOf = (t: DecorText) => (SINGLE_WEIGHT.has(t.font) ? 400 : t.weight || 700);
const fontOf = (t: DecorText, size: number) => `${weightOf(t)} ${size}px '${t.font}', 'Sarabun', sans-serif`;

function newItem(kind: Kind): DecorText {
  return kind === 'badge'
    ? { field: 'text', text: 'ข้อความของร้าน', x: 500, y: 130, maxWidth: 700, font: 'Prompt', weight: 700, size: 72, color: '#FFFFFF', align: 'center', path: 'arc-top', stroke: '#1F1B24', strokeWidth: 0, shadow: true }
    : { field: 'text', text: 'ข้อความของร้าน', x: 600, y: 1700, maxWidth: 1000, font: 'Prompt', weight: 700, size: 84, color: '#FFFFFF', align: 'center', path: 'line', stroke: '#1F1B24', strokeWidth: 0, shadow: true };
}

const graphemes = (text: string) =>
  typeof Intl !== 'undefined' && 'Segmenter' in Intl ? [...new Intl.Segmenter('th', { granularity: 'grapheme' }).segment(text)].map((s) => s.segment) : [...text];

/** Text along the badge circle (centre 500, 500), like the kiosk's arcText. */
function arcText(ctx: CanvasRenderingContext2D, text: string, r: number, t: DecorText, top: boolean) {
  const chars = graphemes(text);
  const maxAngle = Math.min(Math.PI * 1.2, t.maxWidth / r);
  let s = t.size;
  let widths: number[] = [];
  let total = 0;
  for (;;) {
    ctx.font = fontOf(t, s);
    widths = chars.map((ch) => ctx.measureText(ch).width);
    total = widths.reduce((a, b) => a + b, 0) + s * 0.08 * (chars.length - 1);
    if (total / r <= maxAngle || s <= 14) break;
    s -= 2;
  }
  const span = total / r;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let acc = 0;
  chars.forEach((ch, i) => {
    const mid = (acc + widths[i]! / 2) / r;
    const a = top ? -Math.PI / 2 - span / 2 + mid : Math.PI / 2 + span / 2 - mid;
    ctx.save();
    ctx.translate(500 + Math.cos(a) * r, 500 + Math.sin(a) * r);
    ctx.rotate(top ? a + Math.PI / 2 : a - Math.PI / 2);
    if (t.stroke && t.strokeWidth) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = t.strokeWidth;
      ctx.strokeStyle = t.stroke;
      ctx.strokeText(ch, 0, 0);
    }
    ctx.fillStyle = t.color;
    ctx.fillText(ch, 0, 0);
    ctx.restore();
    acc += widths[i]! + s * 0.08;
  });
}

function drawItems(ctx: CanvasRenderingContext2D, kind: Kind, items: DecorText[], values: Record<string, string>) {
  for (const t of items) {
    const text = t.field === 'text' ? t.text : values[t.field] ?? '';
    if (!text) continue;
    ctx.save();
    if (t.shadow) {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
      ctx.shadowBlur = Math.max(4, t.size * 0.14);
      ctx.shadowOffsetY = Math.max(2, t.size * 0.05);
    }
    if (kind === 'badge' && (t.path === 'arc-top' || t.path === 'arc-bottom')) {
      arcText(ctx, text, Math.max(40, Math.abs(500 - t.y)), t, t.path === 'arc-top');
      ctx.restore();
      continue;
    }
    // Shrink until it fits the line's width
    let size = t.size;
    const min = Math.max(8, t.size * 0.45);
    ctx.font = fontOf(t, size);
    while (ctx.measureText(text).width > t.maxWidth && size > min) {
      size -= 1;
      ctx.font = fontOf(t, size);
    }
    ctx.textAlign = t.align;
    ctx.textBaseline = 'alphabetic';
    if (t.stroke && t.strokeWidth) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = t.strokeWidth * (size / t.size);
      ctx.strokeStyle = t.stroke;
      ctx.strokeText(text, t.x, t.y);
      ctx.shadowColor = 'transparent';
    }
    ctx.fillStyle = t.color;
    ctx.fillText(text, t.x, t.y);
    ctx.restore();
  }
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={clsx('flex min-w-0 flex-col gap-1 text-sm', className)}>
      <span className="font-medium text-ink-700">{label}</span>
      {children}
    </label>
  );
}
const control = 'h-9 w-full min-w-0 rounded-md border border-ink-200 bg-white px-2 text-sm disabled:bg-ink-50';

export function DecorTextEditor({
  value,
  onChange,
  photo,
  badge,
  values,
  disabled
}: {
  value: Record<string, DecorText[]>;
  onChange: (next: Record<string, DecorText[]>) => void;
  photo: DecorTemplate[];
  badge: DecorTemplate[];
  /** The kiosk fills these in at print time (from the brand and event settings). */
  values: Record<string, string>;
  disabled?: boolean;
}) {
  const [kind, setKind] = useState<Kind>(photo.length ? 'photo-4x6' : 'badge');
  const list = kind === 'badge' ? badge : photo;
  const [templateId, setTemplateId] = useState(() => list[0]?.id ?? '');
  const [selected, setSelected] = useState(0);
  const [fontsReady, setFontsReady] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<{ src: string; img: HTMLImageElement | null }>({ src: '', img: null });
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  const template = list.find((t) => t.id === templateId) ?? list[0];
  const items = useMemo(() => (template ? (value[template.id] ?? []) : []), [value, template]);
  const item = items[selected];
  const units = UNITS[kind];
  const scale = STAGE_W / units.w;

  // The kiosk's print fonts (Google Fonts), for a preview that matches the print
  useEffect(() => {
    if (!document.querySelector(`link[data-decor-fonts]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = GOOGLE_FONTS_URL;
      link.dataset.decorFonts = '1';
      document.head.appendChild(link);
    }
  }, []);
  useEffect(() => {
    let alive = true;
    Promise.all(items.map((t) => document.fonts.load(fontOf(t, 40), 'กขค Aa').catch(() => []))).then(() => alive && setFontsReady((n) => n + 1));
    return () => {
      alive = false;
    };
  }, [items]);

  // Redraw: preview image, then the lines
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !template) return;
    const ctx = canvas.getContext('2d')!;
    const draw = () => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#F4F1EE';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const dpr = canvas.width / STAGE_W;
      ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
      if (kind === 'badge') {
        ctx.save();
        ctx.beginPath();
        ctx.arc(500, 500, 500, 0, Math.PI * 2);
        ctx.clip();
      }
      const img = imgRef.current.img;
      if (img && imgRef.current.src === template.image) ctx.drawImage(img, 0, 0, units.w, units.h);
      drawItems(ctx, kind, items, values);
      if (kind === 'badge') ctx.restore();
      // Selected line: its anchor and width
      if (item && !(kind === 'badge' && item.path !== 'line')) {
        const left = item.align === 'center' ? item.x - item.maxWidth / 2 : item.align === 'right' ? item.x - item.maxWidth : item.x;
        ctx.strokeStyle = 'rgba(249, 115, 22, 0.9)';
        ctx.lineWidth = 3 / scale / dpr;
        ctx.setLineDash([12, 8]);
        ctx.strokeRect(left, item.y - item.size, item.maxWidth, item.size * 1.25);
        ctx.setLineDash([]);
      }
    };
    if (template.image && imgRef.current.src !== template.image) {
      const img = new Image();
      img.onload = () => {
        imgRef.current = { src: template.image!, img };
        draw();
      };
      img.src = template.image;
      imgRef.current = { src: '', img: null };
    }
    draw();
  }, [template, items, item, kind, values, scale, units, fontsReady]);

  const write = (next: DecorText[]) => {
    if (!template) return;
    const out = { ...value };
    if (next.length) out[template.id] = next;
    else delete out[template.id];
    onChange(out);
  };
  const patch = (p: Partial<DecorText>) => write(items.map((t, i) => (i === selected ? { ...t, ...p } : t)));
  const add = () => {
    write([...items, newItem(kind)]);
    setSelected(items.length);
  };
  const remove = () => {
    write(items.filter((_, i) => i !== selected));
    setSelected(Math.max(0, selected - 1));
  };
  const duplicate = () => {
    if (!item) return;
    write([...items, { ...item, y: Math.min(units.h - 20, item.y + item.size * 1.4) }]);
    setSelected(items.length);
  };

  const toUnits = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * units.w, y: ((e.clientY - r.top) / r.height) * units.h };
  };
  const onDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (disabled || !items.length) return;
    const p = toUnits(e);
    // Nearest line to the pointer
    let best = -1;
    let bestD = Infinity;
    items.forEach((t, i) => {
      const d = Math.hypot(t.x - p.x, t.y - t.size / 2 - p.y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    if (best < 0 || bestD > units.w * 0.35) return;
    setSelected(best);
    drag.current = { dx: items[best]!.x - p.x, dy: items[best]!.y - p.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drag.current || disabled) return;
    const p = toUnits(e);
    patch({ x: Math.round(Math.max(0, Math.min(units.w, p.x + drag.current.dx))), y: Math.round(Math.max(0, Math.min(units.h, p.y + drag.current.dy))) });
  };
  const onUp = () => {
    drag.current = null;
  };

  const counts = (id: string) => value[id]?.length ?? 0;
  const dpr = typeof window === 'undefined' ? 1 : Math.min(2, window.devicePixelRatio || 1);

  return (
    <div className="flex flex-col gap-4 md:col-span-2">
      <div className="flex flex-wrap gap-2">
        {(['photo-4x6', 'badge'] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setKind(k);
              setTemplateId((k === 'badge' ? badge : photo)[0]?.id ?? '');
              setSelected(0);
            }}
            className={clsx('rounded-full border px-3 py-1.5 text-sm font-medium', kind === k ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-ink-200 text-ink-600')}
          >
            {k === 'badge' ? 'เข็มกลัด' : 'ภาพ 4x6'} ({(k === 'badge' ? badge : photo).reduce((n, t) => n + (counts(t.id) ? 1 : 0), 0)} แบบมีข้อความ)
          </button>
        ))}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {list.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setTemplateId(t.id);
              setSelected(0);
            }}
            className={clsx('relative flex w-20 shrink-0 flex-col items-center gap-1 rounded-lg border p-1 text-xs', template?.id === t.id ? 'border-primary-500 bg-primary-50' : 'border-ink-200')}
            title={t.name}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {t.image ? <img src={t.image} alt="" className={clsx('w-full object-cover', kind === 'badge' ? 'aspect-square rounded-full' : 'aspect-[2/3] rounded')} /> : <span className="aspect-[2/3] w-full rounded bg-ink-100" />}
            <span className="w-full truncate">{t.name}</span>
            {counts(t.id) ? <span className="absolute right-1 top-1 rounded-full bg-primary-600 px-1.5 text-[11px] font-semibold text-white">{counts(t.id)}</span> : null}
          </button>
        ))}
      </div>

      {template ? (
        <div className="grid gap-5 lg:grid-cols-[auto_1fr]">
          <div className="flex flex-col items-center gap-2">
            <canvas
              ref={canvasRef}
              width={Math.round(STAGE_W * dpr)}
              height={Math.round(units.h * scale * dpr)}
              style={{ width: STAGE_W, height: units.h * scale, touchAction: 'none' }}
              className={clsx('max-w-full rounded-lg border border-ink-200 bg-ink-50', kind === 'badge' && 'rounded-full', !disabled && items.length && 'cursor-move')}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
            />
            <span className="text-xs text-ink-500">ลากข้อความบนภาพเพื่อย้ายตำแหน่ง • ภาพตัวอย่างใช้รูปจำลอง</span>
          </div>

          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {items.map((t, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSelected(i)}
                  className={clsx('max-w-48 truncate rounded-md border px-2.5 py-1 text-sm', i === selected ? 'border-primary-500 bg-primary-50 font-semibold' : 'border-ink-200')}
                >
                  {t.field === 'text' ? t.text || '(ว่าง)' : FIELDS.find((f) => f.id === t.field)?.name}
                </button>
              ))}
              {!disabled ? (
                <button type="button" onClick={add} disabled={items.length >= DECOR_MAX_ITEMS} className="inline-flex items-center gap-1 rounded-md border border-dashed border-ink-300 px-2.5 py-1 text-sm text-ink-700 disabled:opacity-40">
                  <Plus className="size-4" aria-hidden /> เพิ่มข้อความ
                </button>
              ) : null}
            </div>

            {item ? (
              <fieldset disabled={disabled} className="grid gap-3 sm:grid-cols-2">
                <Field label="ข้อความ">
                  <select className={control} value={item.field} onChange={(e) => patch({ field: e.target.value as DecorText['field'] })}>
                    {FIELDS.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </Field>
                {item.field === 'text' ? (
                  <Field label="พิมพ์ข้อความ">
                    <input className={control} value={item.text} maxLength={120} onChange={(e) => patch({ text: e.target.value })} />
                  </Field>
                ) : (
                  <Field label="ตัวอย่าง">
                    <input className={control} value={values[item.field] || '(ยังไม่ได้ตั้งในแบรนด์และธีมงาน)'} readOnly />
                  </Field>
                )}
                <Field label="ฟอนต์">
                  <select className={control} value={item.font} onChange={(e) => patch({ font: e.target.value as DecorText['font'] })} style={{ fontFamily: `'${item.font}', 'Sarabun', sans-serif` }}>
                    {DECOR_FONTS.map((f) => (
                      <option key={f} value={f} style={{ fontFamily: `'${f}', sans-serif` }}>
                        {FONT_LABELS[f] ?? `${f} (อังกฤษเท่านั้น)`}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="ความหนา">
                  <select className={control} value={weightOf(item)} disabled={SINGLE_WEIGHT.has(item.font)} onChange={(e) => patch({ weight: Number(e.target.value) })}>
                    <option value={400}>ปกติ</option>
                    <option value={700}>หนา</option>
                  </select>
                </Field>
                <Field label={`ขนาด ${Math.round(item.size)}`}>
                  <input type="range" min={20} max={kind === 'badge' ? 200 : 260} value={item.size} onChange={(e) => patch({ size: Number(e.target.value) })} />
                </Field>
                <Field label={`ความกว้างสูงสุด ${Math.round(item.maxWidth)}`}>
                  <input type="range" min={100} max={units.w} value={item.maxWidth} onChange={(e) => patch({ maxWidth: Number(e.target.value) })} />
                </Field>
                <Field label="สีตัวอักษร" className="sm:col-span-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {SWATCHES.map((c) => (
                      <button key={c} type="button" aria-label={c} onClick={() => patch({ color: c })} className={clsx('size-7 rounded-full border', item.color.toUpperCase() === c ? 'ring-2 ring-primary-500 ring-offset-1' : 'border-ink-200')} style={{ background: c }} />
                    ))}
                    <input type="color" value={item.color} onChange={(e) => patch({ color: e.target.value })} className="h-7 w-10 rounded border border-ink-200" aria-label="เลือกสีเอง" />
                  </div>
                </Field>
                {kind === 'badge' ? (
                  <Field label="แนวข้อความ">
                    <select className={control} value={item.path} onChange={(e) => patch({ path: e.target.value as DecorText['path'] })}>
                      <option value="line">แนวตรง</option>
                      <option value="arc-top">โค้งตามขอบบน</option>
                      <option value="arc-bottom">โค้งตามขอบล่าง</option>
                    </select>
                  </Field>
                ) : null}
                <Field label="จัดตำแหน่ง">
                  <select className={control} value={item.align} onChange={(e) => patch({ align: e.target.value as DecorText['align'] })} disabled={kind === 'badge' && item.path !== 'line'}>
                    <option value="left">ชิดซ้าย</option>
                    <option value="center">กึ่งกลาง</option>
                    <option value="right">ชิดขวา</option>
                  </select>
                </Field>
                <Field label={`ขอบตัวอักษร ${item.strokeWidth}`}>
                  <div className="flex items-center gap-2">
                    <input type="range" min={0} max={20} value={item.strokeWidth} onChange={(e) => patch({ strokeWidth: Number(e.target.value) })} className="min-w-0 flex-1" />
                    <input type="color" value={item.stroke || '#1F1B24'} onChange={(e) => patch({ stroke: e.target.value })} className="h-7 w-10 rounded border border-ink-200" aria-label="สีขอบ" />
                  </div>
                </Field>
                <label className="flex items-center gap-2 text-sm text-ink-700">
                  <input type="checkbox" checked={item.shadow} onChange={(e) => patch({ shadow: e.target.checked })} className="size-4 accent-primary-600" /> เงาใต้ตัวอักษร
                </label>
                <div className="flex gap-2 sm:col-span-2">
                  <button type="button" onClick={duplicate} disabled={items.length >= DECOR_MAX_ITEMS} className="inline-flex items-center gap-1 rounded-md border border-ink-200 px-2.5 py-1.5 text-sm disabled:opacity-40">
                    <Copy className="size-4" aria-hidden /> ทำซ้ำ
                  </button>
                  <button type="button" onClick={remove} className="inline-flex items-center gap-1 rounded-md border border-danger-200 px-2.5 py-1.5 text-sm text-danger-600">
                    <Trash2 className="size-4" aria-hidden /> ลบข้อความนี้
                  </button>
                </div>
              </fieldset>
            ) : (
              <p className="text-sm text-ink-500">ยังไม่มีข้อความบน {template.name} {disabled ? '' : '— กด "เพิ่มข้อความ"'}</p>
            )}
          </div>
        </div>
      ) : (
        <p className="text-sm text-ink-500">ไม่มี template ให้เลือก</p>
      )}
    </div>
  );
}
