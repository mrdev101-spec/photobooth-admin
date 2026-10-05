'use client';

import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import clsx from 'clsx';
import { Plus, RotateCw, Trash2 } from 'lucide-react';
import type { SheetLayout } from '@photobooth/contracts';
import { DEFAULT_MARGIN, QUEUE_BOX_MM, SHEET_PRESETS, SHEET_SIZES, SLOT_ASPECTS, kioskDefaultLayout, layoutPreset, layoutProblems, maxPhotoScale, normalizeLayout, photoRect, zoneSpots, type SheetId } from '@/lib/sheet-layout';

/**
 * A4 / A5 sheet layout (the photo printer on sheet paper), in mm on the portrait page. null =
 * the kiosk's own preset. Photos, badge areas and the queue number box are dragged on the sheet.
 */

type Sel = { kind: 'photo' | 'zone'; i: number } | { kind: 'queue' } | null;
const control = 'h-9 w-full min-w-0 rounded-md border border-ink-200 bg-white px-2 text-sm disabled:bg-ink-50';
const round1 = (v: number) => Math.round(v * 10) / 10;

export function SheetLayoutEditor({
  sheet,
  value,
  onChange,
  badgeCut,
  disabled
}: {
  sheet: SheetId;
  value: SheetLayout | null;
  onChange: (next: SheetLayout | null) => void;
  /** Cut diameter of the badge size (mm), to show how many badges fit. */
  badgeCut: number;
  disabled?: boolean;
}) {
  const size = SHEET_SIZES[sheet];
  const layout = value ?? kioskDefaultLayout(sheet);
  const [sel, setSel] = useState<Sel>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const problems = layoutProblems(layout, sheet);
  const badges = layout.zones.reduce((n, z) => n + zoneSpots(z, badgeCut).length, 0);

  const commit = (next: SheetLayout) => onChange(normalizeLayout(next, sheet));
  const toMm = (e: ReactPointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * size.w, y: ((e.clientY - r.top) / r.height) * size.h };
  };
  const posOf = (s: Exclude<Sel, null>) => (s.kind === 'queue' ? layout.queue : s.kind === 'photo' ? layout.photos[s.i]! : layout.zones[s.i]!);
  const startDrag = (s: Exclude<Sel, null>) => (e: ReactPointerEvent) => {
    setSel(s);
    if (disabled) return;
    e.stopPropagation();
    const p = toMm(e);
    const at = posOf(s);
    drag.current = { dx: at.x - p.x, dy: at.y - p.y };
    svgRef.current!.setPointerCapture(e.pointerId);
  };
  const onMove = (e: ReactPointerEvent) => {
    if (!drag.current || !sel || disabled) return;
    const p = toMm(e);
    const x = round1(p.x + drag.current.dx);
    const y = round1(p.y + drag.current.dy);
    if (sel.kind === 'queue') commit({ ...layout, queue: { ...layout.queue, x, y } });
    else if (sel.kind === 'photo') commit({ ...layout, photos: layout.photos.map((ph, i) => (i === sel.i ? { ...ph, x, y } : ph)) });
    else commit({ ...layout, zones: layout.zones.map((z, i) => (i === sel.i ? { ...z, x, y } : z)) });
  };
  const endDrag = () => {
    drag.current = null;
  };

  const photo = sel?.kind === 'photo' ? layout.photos[sel.i] : undefined;
  const zone = sel?.kind === 'zone' ? layout.zones[sel.i] : undefined;
  const setPhoto = (p: Partial<SheetLayout['photos'][number]>) => sel?.kind === 'photo' && commit({ ...layout, photos: layout.photos.map((ph, i) => (i === sel.i ? { ...ph, ...p } : ph)) });
  const setZone = (p: Partial<SheetLayout['zones'][number]>) => sel?.kind === 'zone' && commit({ ...layout, zones: layout.zones.map((z, i) => (i === sel.i ? { ...z, ...p } : z)) });
  const removeSel = () => {
    if (sel?.kind === 'photo') commit({ ...layout, photos: layout.photos.filter((_, i) => i !== sel.i) });
    if (sel?.kind === 'zone') commit({ ...layout, zones: layout.zones.filter((_, i) => i !== sel.i) });
    setSel(null);
  };
  const m = DEFAULT_MARGIN;
  const stageW = sheet === 'a4' ? 300 : 260;

  return (
    <div className="flex flex-col gap-3 md:col-span-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-56 flex-1 flex-col gap-1 text-sm">
          <span className="font-medium text-ink-700">เริ่มจากแบบสำเร็จรูป</span>
          <select
            className={control}
            disabled={disabled}
            value=""
            onChange={(e) => {
              if (!e.target.value) return;
              onChange(layoutPreset(e.target.value, sheet));
              setSel(null);
            }}
          >
            <option value="">เลือกแบบ…</option>
            {SHEET_PRESETS[sheet].map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        {!disabled ? (
          <>
            <button type="button" disabled={layout.photos.length >= 6} onClick={() => { commit({ ...layout, photos: [...layout.photos, { x: m, y: m, rotated: false, turn: 'cw', scale: 1, aspect: '2:3' }] }); setSel({ kind: 'photo', i: layout.photos.length }); }} className="inline-flex h-9 items-center gap-1 rounded-md border border-ink-200 px-2.5 text-sm disabled:opacity-40">
              <Plus className="size-4" aria-hidden /> ช่องภาพ
            </button>
            <button type="button" disabled={layout.zones.length >= 8} onClick={() => { commit({ ...layout, zones: [...layout.zones, { x: m, y: m, w: 80, h: 80 }] }); setSel({ kind: 'zone', i: layout.zones.length }); }} className="inline-flex h-9 items-center gap-1 rounded-md border border-ink-200 px-2.5 text-sm disabled:opacity-40">
              <Plus className="size-4" aria-hidden /> พื้นที่เข็มกลัด
            </button>
            {value ? (
              <button type="button" onClick={() => { onChange(null); setSel(null); }} className="h-9 rounded-md px-2.5 text-sm text-ink-600 underline-offset-2 hover:underline">
                กลับไปใช้แบบเริ่มต้นของตู้
              </button>
            ) : null}
          </>
        ) : null}
      </div>
      <p className="text-xs text-ink-500">
        {value ? 'ตั้งการจัดวางเองแล้ว' : 'ตอนนี้ใช้แบบเริ่มต้นของตู้'} • ภาพต่อแผ่น {layout.photos.length} • เข็มกลัดต่อแผ่น {badges} (ขนาดที่ตั้งไว้) • ขอบเครื่องพิมพ์ {m} มม. (ตู้ชดเชยขอบและขนาดเองตามเครื่องพิมพ์)
      </p>

      <div className="grid gap-4 lg:grid-cols-[auto_1fr]">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${size.w} ${size.h}`}
          style={{ width: stageW, height: (stageW * size.h) / size.w, touchAction: 'none' }}
          className="max-w-full rounded-md border border-ink-300 bg-white shadow-sm"
          onPointerMove={onMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onPointerDown={() => setSel(null)}
          role="img"
          aria-label={`การจัดวางบนแผ่น ${size.name}`}
        >
          <rect x={m} y={m} width={size.w - 2 * m} height={size.h - 2 * m} fill="none" stroke="#e7e2dd" strokeDasharray="2 2" strokeWidth={0.4} />
          {layout.zones.map((z, i) => (
            <g key={`z${i}`} onPointerDown={startDrag({ kind: 'zone', i })} className={disabled ? '' : 'cursor-move'}>
              <rect x={z.x} y={z.y} width={z.w} height={z.h} fill="#f5f3ff" stroke={sel?.kind === 'zone' && sel.i === i ? '#f97316' : '#a78bfa'} strokeWidth={sel?.kind === 'zone' && sel.i === i ? 1 : 0.5} strokeDasharray="3 2" />
              {zoneSpots(z, badgeCut).map((s, k) => (
                <circle key={k} cx={s.cx} cy={s.cy} r={badgeCut / 2} fill="#ede9fe" stroke="#8b5cf6" strokeWidth={0.4} />
              ))}
            </g>
          ))}
          {layout.photos.map((p, i) => {
            const r = photoRect(p);
            const on = sel?.kind === 'photo' && sel.i === i;
            return (
              <g key={`p${i}`} onPointerDown={startDrag({ kind: 'photo', i })} className={disabled ? '' : 'cursor-move'}>
                <rect x={r.x} y={r.y} width={r.w} height={r.h} fill="#ffedd5" stroke={on ? '#f97316' : '#fdba74'} strokeWidth={on ? 1.2 : 0.6} />
                <text x={r.x + r.w / 2} y={r.y + r.h / 2} textAnchor="middle" dominantBaseline="middle" fontSize={9} fill="#c2410c" fontWeight={700}>
                  ภาพ {i + 1}
                </text>
                <text x={r.x + r.w / 2} y={r.y + r.h / 2 + 9} textAnchor="middle" dominantBaseline="middle" fontSize={5} fill="#9a3412">
                  {p.aspect}
                  {p.rotated ? ' • นอน' : ''} • {Math.round(p.scale * 100)}%
                </text>
              </g>
            );
          })}
          {layout.queue.show ? (
            <g onPointerDown={startDrag({ kind: 'queue' })} className={disabled ? '' : 'cursor-move'}>
              <rect x={layout.queue.x} y={layout.queue.y} width={QUEUE_BOX_MM.w} height={QUEUE_BOX_MM.h} fill="#f0fdf4" stroke={sel?.kind === 'queue' ? '#f97316' : '#22c55e'} strokeWidth={0.6} />
              <text x={layout.queue.x + QUEUE_BOX_MM.w / 2} y={layout.queue.y + QUEUE_BOX_MM.h / 2} textAnchor="middle" dominantBaseline="middle" fontSize={5} fill="#15803d" fontWeight={700}>
                คิว A001
              </text>
            </g>
          ) : null}
        </svg>

        <div className="flex min-w-0 flex-col gap-3">
          {layout.zones.length && !badges ? (
            <p className="rounded-md bg-warning-50 px-3 py-2 text-sm text-warning-700">พื้นที่เข็มกลัดเล็กกว่าเข็มกลัดขนาดที่ตั้งไว้ (วงตัด {badgeCut} มม.) จึงใส่ไม่ได้สักอัน — ขยายพื้นที่ หรือเลือกเข็มกลัดขนาดเล็กลง</p>
          ) : null}
          {problems.length ? (
            <p className="rounded-md bg-warning-50 px-3 py-2 text-sm text-warning-700">
              {problems.some((p) => p.kind === 'edge') ? 'มีช่องเลยขอบพิมพ์ ' : ''}
              {problems.some((p) => p.kind === 'overlap') ? 'มีช่องซ้อนกัน (ภาพ/เข็มกลัด/เลขคิว) ' : ''}— ตู้ยังพิมพ์ได้ แต่ตรวจตำแหน่งอีกครั้ง
            </p>
          ) : null}

          {photo ? (
            <fieldset disabled={disabled} className="grid gap-3 rounded-lg border border-ink-200 p-3 sm:grid-cols-2">
              <div className="font-semibold text-ink-900 sm:col-span-2">ช่องภาพ {sel!.kind === 'photo' ? sel!.i + 1 : ''}</div>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-ink-700">รูปทรงช่อง</span>
                <select className={control} value={photo.aspect} onChange={(e) => setPhoto({ aspect: e.target.value as SheetLayout['photos'][number]['aspect'] })}>
                  {SLOT_ASPECTS.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-ink-700">ขนาด {Math.round(photo.scale * 100)}%</span>
                <input type="range" min={30} max={Math.max(100, Math.floor(maxPhotoScale(size, m, photo.rotated, photo.aspect) * 100))} value={Math.round(photo.scale * 100)} onChange={(e) => setPhoto({ scale: Number(e.target.value) / 100 })} />
              </label>
              <div className="flex flex-wrap gap-2 sm:col-span-2">
                <button type="button" onClick={() => setPhoto({ rotated: !photo.rotated })} className="inline-flex items-center gap-1 rounded-md border border-ink-200 px-2.5 py-1.5 text-sm">
                  <RotateCw className="size-4" aria-hidden /> {photo.rotated ? 'วางตั้ง' : 'วางนอน'}
                </button>
                {photo.rotated ? (
                  <select className={clsx(control, 'w-auto')} value={photo.turn} onChange={(e) => setPhoto({ turn: e.target.value as 'cw' | 'ccw' })} aria-label="ทิศหัวภาพ">
                    <option value="cw">หัวภาพไปทางขวา</option>
                    <option value="ccw">หัวภาพไปทางซ้าย</option>
                  </select>
                ) : null}
                <button type="button" onClick={removeSel} className="inline-flex items-center gap-1 rounded-md border border-danger-200 px-2.5 py-1.5 text-sm text-danger-600">
                  <Trash2 className="size-4" aria-hidden /> ลบช่องนี้
                </button>
              </div>
            </fieldset>
          ) : zone ? (
            <fieldset disabled={disabled} className="grid gap-3 rounded-lg border border-ink-200 p-3 sm:grid-cols-2">
              <div className="font-semibold text-ink-900 sm:col-span-2">พื้นที่เข็มกลัด • ใส่ได้ {zoneSpots(zone, badgeCut).length} อัน</div>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-ink-700">กว้าง (มม.)</span>
                <input type="number" className={control} min={10} max={size.w} step={0.5} value={zone.w} onChange={(e) => setZone({ w: Number(e.target.value) })} />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-ink-700">สูง (มม.)</span>
                <input type="number" className={control} min={10} max={size.h} step={0.5} value={zone.h} onChange={(e) => setZone({ h: Number(e.target.value) })} />
              </label>
              <button type="button" onClick={removeSel} className="inline-flex w-fit items-center gap-1 rounded-md border border-danger-200 px-2.5 py-1.5 text-sm text-danger-600">
                <Trash2 className="size-4" aria-hidden /> ลบพื้นที่นี้
              </button>
            </fieldset>
          ) : (
            <p className="text-sm text-ink-500">คลิกช่องบนแผ่นเพื่อแก้ไข หรือลากเพื่อย้าย</p>
          )}

          <fieldset disabled={disabled} className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-ink-700">ภาพไม่ครบช่อง</span>
              <select className={control} value={layout.photoSpare} onChange={(e) => commit({ ...layout, photoSpare: e.target.value as 'repeat' | 'blank' })}>
                <option value="repeat">ใส่ภาพซ้ำให้เต็มทุกช่อง</option>
                <option value="blank">เว้นว่าง</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-ink-700">เข็มกลัดไม่ครบช่อง</span>
              <select className={control} value={layout.badgeSpare} onChange={(e) => commit({ ...layout, badgeSpare: e.target.value as 'repeat' | 'blank' })}>
                <option value="blank">เว้นว่าง</option>
                <option value="repeat">ใส่ซ้ำให้เต็มทุกช่อง</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm text-ink-700 sm:col-span-2">
              <input type="checkbox" checked={layout.queue.show} onChange={(e) => commit({ ...layout, queue: { ...layout.queue, show: e.target.checked } })} className="size-4 accent-primary-600" />
              พิมพ์เลขคิวบนแผ่น (เมื่อตู้พิมพ์ใบคิว)
            </label>
          </fieldset>
        </div>
      </div>
    </div>
  );
}
