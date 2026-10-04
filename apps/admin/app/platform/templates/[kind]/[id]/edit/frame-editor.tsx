'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import clsx from 'clsx';
import { Circle, ImagePlus, RectangleHorizontal, Rocket, Save, Trash2, Type, Undo2 } from 'lucide-react';
import { TEMPLATE_CANVAS, TEMPLATE_FONTS, TEMPLATE_TEXT_FIELDS, frameIssues, type FrameSpec, type TextSlot } from '@photobooth/contracts';
import { Button, buttonClass } from '@/components/ui';
import { loadImage, previewBlob, renderFrame, SAMPLE_TEXTS } from '@/lib/frame-render';
import { discardDraftAction, publishDraftAction, removeFileAction, saveDraftAction, uploadFileAction } from '../../../studio-actions';

type FrameKind = 'photo-4x6' | 'badge' | 'classic';
type RectSlot = Extract<FrameSpec['photoSlots'][number], { x: number }>;
type CircleSlot = Extract<FrameSpec['photoSlots'][number], { shape: 'circle' }>;
type Sel = { type: 'photo' | 'text'; index: number } | null;

export interface EditorFile {
  url: string;
  width?: number;
  height?: number;
  bytes?: number;
}

const FIELD_LABELS: Record<(typeof TEMPLATE_TEXT_FIELDS)[number], string> = {
  'event.title': 'ชื่องาน',
  'event.subtitle': 'ข้อความรอง',
  'event.date': 'วันที่',
  'brand.brandName': 'ชื่อแบรนด์'
};
const SAMPLE_PHOTOS = ['/catalog/samples/sample.jpg', '/catalog/samples/photo2.jpg', '/catalog/samples/photo3.jpg'];
const FILTERS = [
  ['natural', 'ธรรมชาติ'],
  ['bright', 'สดใส'],
  ['warm', 'อบอุ่น'],
  ['cool', 'โทนเย็น'],
  ['vintage', 'วินเทจ'],
  ['mono', 'ขาวดำ']
] as const;

const KIND_HELP: Record<FrameKind, string> = {
  'photo-4x6': 'PNG 1200 x 1800 px (300 dpi) เว้นช่องรูปให้โปร่งใส bleed 36 px รอบขอบ ข้อความสำคัญห่างขอบ 60 px',
  badge: 'PNG 1000 x 1000 px (= วงตัดของเข็มกลัด) ช่องรูปวงกลม 1 ช่อง ข้อความอยู่ในวงกลางประมาณ 71%',
  classic: 'PNG กว้าง 576 px (80 มม.) หรือ 384 px (58 มม.) ขาวดำ ตู้แปลงเป็นเม็ดสกรีนเอง'
};

function defaultCanvas(kind: FrameKind) {
  if (kind === 'badge') return { w: 1000, h: 1000 };
  if (kind === 'classic') return { w: 576, h: 900 };
  return { w: 1200, h: 1800 };
}

export function FrameEditor({
  kind,
  id,
  initialSpec,
  overlay,
  sample,
  draftVersion,
  hasPublished
}: {
  kind: FrameKind;
  id: string;
  initialSpec: FrameSpec;
  overlay: EditorFile | null;
  sample: EditorFile | null;
  draftVersion: number | null;
  hasPublished: boolean;
}) {
  const router = useRouter();
  const [spec, setSpec] = useState<FrameSpec>(initialSpec);
  const [sel, setSel] = useState<Sel>({ type: 'photo', index: 0 });
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [dirty, setDirty] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [images, setImages] = useState<{ overlay: HTMLImageElement | null; photos: HTMLImageElement[] }>({ overlay: null, photos: [] });

  const W = overlay?.width ?? defaultCanvas(kind).w;
  const H = overlay?.height ?? defaultCanvas(kind).h;
  const rules = TEMPLATE_CANVAS[kind];
  const issues = useMemo(() => frameIssues(kind, spec, overlay ?? undefined), [kind, spec, overlay]);

  useEffect(() => setSpec(initialSpec), [initialSpec]);

  // Load the overlay and sample photos once per overlay
  useEffect(() => {
    let alive = true;
    Promise.all([overlay ? loadImage(overlay.url) : Promise.resolve(null), Promise.all(SAMPLE_PHOTOS.map(loadImage))])
      .then(([o, photos]) => alive && setImages({ overlay: o, photos }))
      .catch((e: Error) => alive && setMsg({ ok: false, text: e.message }));
    return () => {
      alive = false;
    };
  }, [overlay]);

  // Re-render the preview shortly after each change
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const t = setTimeout(() => void renderFrame(c, { width: W, height: H, spec, overlay: images.overlay, photos: images.photos, mono: kind === 'classic' }), 120);
    return () => clearTimeout(t);
  }, [spec, images, W, H, kind]);

  // Leaving with unsaved slot changes loses them
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const update = useCallback((fn: (s: FrameSpec) => FrameSpec) => {
    setSpec((s) => fn(structuredClone(s)));
    setDirty(true);
    setMsg(null);
  }, []);

  // ─── Dragging on the preview ───────────────────────────────────────────────
  const drag = useRef<{ sel: NonNullable<Sel>; mode: 'move' | 'resize'; x0: number; y0: number; orig: unknown } | null>(null);
  const scale = () => (boxRef.current ? boxRef.current.clientWidth / W : 1);

  const onPointerDown = (e: React.PointerEvent, s: NonNullable<Sel>, mode: 'move' | 'resize') => {
    e.stopPropagation();
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setSel(s);
    const orig = s.type === 'photo' ? spec.photoSlots[s.index] : spec.textSlots[s.index];
    drag.current = { sel: s, mode, x0: e.clientX, y0: e.clientY, orig: structuredClone(orig) };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const k = scale();
    const dx = Math.round((e.clientX - d.x0) / k);
    const dy = Math.round((e.clientY - d.y0) / k);
    update((s) => {
      if (d.sel.type === 'text') {
        const o = d.orig as TextSlot;
        s.textSlots[d.sel.index] = { ...s.textSlots[d.sel.index]!, x: o.x + dx, y: o.y + dy };
      } else {
        const o = d.orig as RectSlot | CircleSlot;
        if ('shape' in o) {
          s.photoSlots[d.sel.index] = d.mode === 'move' ? { ...o, cx: o.cx + dx, cy: o.cy + dy } : { ...o, r: Math.max(20, o.r + Math.round((dx + dy) / 2)) };
        } else {
          s.photoSlots[d.sel.index] = d.mode === 'move' ? { ...o, x: o.x + dx, y: o.y + dy } : { ...o, w: Math.max(20, o.w + dx), h: Math.max(20, o.h + dy) };
        }
      }
      return s;
    });
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  // ─── Slots ────────────────────────────────────────────────────────────────
  const addPhoto = () =>
    update((s) => {
      if (kind === 'badge') s.photoSlots.push({ shape: 'circle', cx: W / 2, cy: H / 2, r: Math.round(W * 0.33), focus: 'face' });
      else s.photoSlots.push({ x: Math.round(W * 0.2), y: Math.round(H * 0.2), w: Math.round(W * 0.6), h: Math.round(H * 0.3), radius: 0, rotate: 0, focus: 'face' });
      setSel({ type: 'photo', index: s.photoSlots.length - 1 });
      return s;
    });
  const addText = () =>
    update((s) => {
      s.textSlots.push({
        field: 'event.title',
        x: Math.round(W / 2),
        y: kind === 'badge' ? Math.round(H * 0.12) : Math.round(H - rules.safe - 40),
        maxWidth: Math.round(W - rules.safe * 2 - 40),
        font: 'Fredoka',
        weight: 700,
        size: Math.round(W / 16),
        color: kind === 'classic' ? '#000000' : '#FFFFFF',
        align: 'center',
        letterSpacing: 0,
        path: kind === 'badge' ? 'arc-top' : 'straight'
      });
      setSel({ type: 'text', index: s.textSlots.length - 1 });
      return s;
    });
  const removeSel = () => {
    if (!sel) return;
    update((s) => {
      if (sel.type === 'photo') s.photoSlots.splice(sel.index, 1);
      else s.textSlots.splice(sel.index, 1);
      return s;
    });
    setSel(null);
  };

  // ─── Server ───────────────────────────────────────────────────────────────
  const upload = (slot: 'overlay' | 'sample', file: File | undefined) => {
    if (!file) return;
    start(async () => {
      const fd = new FormData();
      fd.set('slot', slot);
      fd.set('file', file);
      const r = await uploadFileAction(kind, id, fd);
      setMsg({ ok: r.ok, text: r.message ?? (r.ok ? 'อัปโหลดแล้ว' : '') });
      if (r.ok) router.refresh();
    });
  };

  const save = async (): Promise<boolean> => {
    const full = document.createElement('canvas');
    await renderFrame(full, { width: W, height: H, spec, overlay: images.overlay, photos: images.photos, mono: kind === 'classic' });
    const fd = new FormData();
    fd.set('spec', JSON.stringify(spec));
    fd.set('note', note);
    // Only a preview with the real overlay is worth showing in the catalog
    if (images.overlay) fd.set('preview', await previewBlob(full), 'preview.jpg');
    const r = await saveDraftAction(kind, id, fd);
    setMsg({ ok: r.ok, text: r.message ?? '' });
    if (r.ok) {
      setDirty(false);
      setNote('');
      router.refresh();
    }
    return r.ok;
  };

  const publish = () =>
    start(async () => {
      if (!(await save())) return;
      const r = await publishDraftAction(kind, id);
      setMsg({ ok: r.ok, text: r.message ?? '' });
      if (r.ok) router.refresh();
    });

  const discard = () =>
    start(async () => {
      if (!window.confirm('ยกเลิกร่างนี้และกลับไปใช้เวอร์ชันที่เผยแพร่อยู่?')) return;
      const r = await discardDraftAction(kind, id);
      setMsg({ ok: r.ok, text: r.message ?? '' });
      if (r.ok) {
        setDirty(false);
        router.refresh();
      }
    });

  const selPhoto = sel?.type === 'photo' ? spec.photoSlots[sel.index] : undefined;
  const selText = sel?.type === 'text' ? spec.textSlots[sel.index] : undefined;
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;

  return (
    <div className="grid gap-5 pb-24 xl:grid-cols-[minmax(0,1fr)_380px]">
      {/* Preview + handles */}
      <div className="flex flex-col gap-3">
        <div className="rounded-card border border-ink-200 bg-[repeating-conic-gradient(#f4f4f5_0_25%,#fff_0_50%)] bg-[length:24px_24px] p-4">
          <div
            ref={boxRef}
            className="relative mx-auto touch-none select-none"
            style={{ width: '100%', maxWidth: kind === 'classic' ? 360 : kind === 'badge' ? 520 : 460, aspectRatio: `${W} / ${H}` }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerDown={() => setSel(null)}
          >
            <canvas ref={canvasRef} className="absolute inset-0 size-full shadow-card" />
            {kind === 'photo-4x6' ? (
              <div className="pointer-events-none absolute border border-dashed border-sky-400/70" style={{ left: pct(rules.safe, W), top: pct(rules.safe, H), right: pct(rules.safe, W), bottom: pct(rules.safe, H) }} title="พื้นที่ปลอดภัย" />
            ) : null}
            {spec.photoSlots.map((s, i) => {
              const active = sel?.type === 'photo' && sel.index === i;
              const box = 'shape' in s ? { left: s.cx - s.r, top: s.cy - s.r, w: s.r * 2, h: s.r * 2 } : { left: s.x, top: s.y, w: s.w, h: s.h };
              return (
                <div
                  key={`p${i}`}
                  role="button"
                  aria-label={`ช่องรูป ${i + 1}`}
                  onPointerDown={(e) => onPointerDown(e, { type: 'photo', index: i }, 'move')}
                  className={clsx('absolute cursor-move border-2', 'shape' in s && 'rounded-full', active ? 'border-primary-600 bg-primary-600/10' : 'border-white/80 border-dashed hover:border-primary-400')}
                  style={{ left: pct(box.left, W), top: pct(box.top, H), width: pct(box.w, W), height: pct(box.h, H), transform: 'shape' in s ? undefined : `rotate(${s.rotate ?? 0}deg)` }}
                >
                  <span className="absolute top-1 left-1 rounded bg-ink-900/80 px-1.5 text-xs font-semibold text-white">รูป {i + 1}</span>
                  <span
                    onPointerDown={(e) => onPointerDown(e, { type: 'photo', index: i }, 'resize')}
                    className="absolute -right-2 -bottom-2 size-4 cursor-nwse-resize rounded-sm border-2 border-white bg-primary-600"
                    aria-hidden
                  />
                </div>
              );
            })}
            {spec.textSlots.map((t, i) => {
              const active = sel?.type === 'text' && sel.index === i;
              return (
                <div
                  key={`t${i}`}
                  role="button"
                  aria-label={`ช่องข้อความ ${i + 1}`}
                  onPointerDown={(e) => onPointerDown(e, { type: 'text', index: i }, 'move')}
                  className={clsx('absolute flex size-5 -translate-x-1/2 -translate-y-1/2 cursor-move items-center justify-center rounded-full border-2 border-white text-[10px] font-bold text-white shadow', active ? 'bg-primary-600' : 'bg-sky-600')}
                  style={{ left: pct(t.x, W), top: pct(t.y, H) }}
                >
                  T{i + 1}
                </div>
              );
            })}
          </div>
        </div>
        <p className="text-sm text-ink-500">
          ลากกรอบเพื่อย้าย ลากจุดมุมเพื่อปรับขนาด จุด T คือตำแหน่งข้อความ • ตัวอย่างใช้ภาพถ่ายตัวอย่างและข้อความตัวอย่าง ({SAMPLE_TEXTS['event.title']})
        </p>
      </div>

      {/* Side panel */}
      <div className="flex flex-col gap-4">
        <section className="rounded-card border border-ink-200 bg-surface p-4 shadow-card">
          <h3 className="mb-1 font-semibold text-ink-900">ไฟล์กรอบ (PNG)</h3>
          <p className="mb-3 text-sm text-ink-500">{KIND_HELP[kind]}</p>
          {overlay ? (
            <p className="mb-2 text-sm text-ink-700">
              ✓ {overlay.width} x {overlay.height} px • {overlay.bytes ? `${Math.round(overlay.bytes / 1024)} KB` : ''}
            </p>
          ) : (
            <p className="mb-2 text-sm font-medium text-danger-600">ยังไม่มีไฟล์กรอบ</p>
          )}
          <label className={buttonClass('outline', 'sm', 'cursor-pointer')}>
            <ImagePlus className="size-4" aria-hidden />
            {overlay ? 'เปลี่ยนไฟล์กรอบ' : 'อัปโหลดไฟล์กรอบ'}
            <input type="file" accept="image/png" className="sr-only" disabled={pending} onChange={(e) => upload('overlay', e.target.files?.[0])} />
          </label>
          <div className="mt-3 border-t border-ink-100 pt-3">
            <p className="mb-2 text-sm text-ink-600">ภาพตัวอย่างจากนักออกแบบ (JPG ไม่บังคับ){sample ? ' ✓' : ''}</p>
            <div className="flex gap-2">
              <label className={buttonClass('ghost', 'sm', 'cursor-pointer')}>
                <ImagePlus className="size-4" aria-hidden />
                {sample ? 'เปลี่ยน' : 'อัปโหลด'}
                <input type="file" accept="image/jpeg,image/png" className="sr-only" disabled={pending} onChange={(e) => upload('sample', e.target.files?.[0])} />
              </label>
              {sample ? (
                <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => start(async () => { const r = await removeFileAction(kind, id, 'sample'); if (r.ok) router.refresh(); })}>
                  ลบ
                </Button>
              ) : null}
            </div>
          </div>
        </section>

        <section className="rounded-card border border-ink-200 bg-surface p-4 shadow-card">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="font-semibold text-ink-900">ช่อง</h3>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={addPhoto} disabled={spec.photoSlots.length >= rules.maxPhotoSlots}>
                {kind === 'badge' ? <Circle className="size-4" aria-hidden /> : <RectangleHorizontal className="size-4" aria-hidden />}
                ช่องรูป
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={addText} disabled={spec.textSlots.length >= 8}>
                <Type className="size-4" aria-hidden />
                ข้อความ
              </Button>
            </div>
          </div>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {spec.photoSlots.map((_, i) => (
              <button key={`sp${i}`} type="button" onClick={() => setSel({ type: 'photo', index: i })} className={clsx('rounded-full px-3 py-1 text-sm font-medium', sel?.type === 'photo' && sel.index === i ? 'bg-primary-600 text-white' : 'bg-ink-100 text-ink-700')}>
                รูป {i + 1}
              </button>
            ))}
            {spec.textSlots.map((_, i) => (
              <button key={`st${i}`} type="button" onClick={() => setSel({ type: 'text', index: i })} className={clsx('rounded-full px-3 py-1 text-sm font-medium', sel?.type === 'text' && sel.index === i ? 'bg-sky-600 text-white' : 'bg-ink-100 text-ink-700')}>
                T{i + 1}
              </button>
            ))}
          </div>

          {selPhoto ? (
            <SlotFields
              fields={'shape' in selPhoto ? (['cx', 'cy', 'r'] as const) : (['x', 'y', 'w', 'h', 'radius', 'rotate'] as const)}
              value={selPhoto as unknown as Record<string, number>}
              onChange={(k, v) =>
                update((s) => {
                  (s.photoSlots[sel!.index] as unknown as Record<string, number>)[k] = v;
                  return s;
                })
              }
            />
          ) : null}
          {selText ? <TextFields slot={selText} badge={kind === 'badge'} onChange={(patch) => update((s) => ({ ...s, textSlots: s.textSlots.map((t, i) => (i === sel!.index ? ({ ...t, ...patch } as TextSlot) : t)) }))} /> : null}
          {sel ? (
            <Button type="button" variant="ghost" size="sm" className="mt-3 text-danger-600" onClick={removeSel} disabled={sel.type === 'photo' && spec.photoSlots.length <= 1}>
              <Trash2 className="size-4" aria-hidden />
              ลบช่องนี้
            </Button>
          ) : (
            <p className="text-sm text-ink-500">เลือกช่องเพื่อแก้ค่า</p>
          )}
        </section>

        <section className="rounded-card border border-ink-200 bg-surface p-4 shadow-card">
          <h3 className="mb-3 font-semibold text-ink-900">ทั่วไป</h3>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm text-ink-700">
              สีพื้นหลัง
              <input type="color" value={spec.background} onChange={(e) => update((s) => ({ ...s, background: e.target.value.toUpperCase() }))} className="h-10 w-full rounded-lg border border-ink-200" />
            </label>
            <label className="flex flex-col gap-1 text-sm text-ink-700">
              ฟิลเตอร์เริ่มต้น
              <select value={spec.defaultFilter} onChange={(e) => update((s) => ({ ...s, defaultFilter: e.target.value }))} className="h-10 rounded-lg border border-ink-200 px-2">
                {FILTERS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        {issues.length ? (
          <section className="rounded-card border border-warning-200 bg-warning-50 p-4 text-sm text-warning-800">
            <p className="mb-1 font-semibold">ต้องแก้ก่อนเผยแพร่</p>
            <ul className="list-disc pl-5">
              {issues.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      {/* Save bar */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-ink-200 bg-surface/95 px-4 py-3 backdrop-blur lg:left-64">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
          <span className="text-sm text-ink-600">{draftVersion ? `ร่างเวอร์ชัน ${draftVersion}` : 'แก้ไขแล้วจะสร้างร่างเวอร์ชันใหม่'}</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="บันทึกการเปลี่ยนแปลง (ไม่บังคับ)" className="h-10 min-w-48 flex-1 rounded-lg border border-ink-200 px-3 text-sm" />
          <Button type="button" variant="outline" disabled={pending} onClick={() => start(async () => void (await save()))}>
            <Save className="size-4" aria-hidden />
            บันทึกร่าง
          </Button>
          <Button type="button" disabled={pending || issues.length > 0} onClick={publish}>
            <Rocket className="size-4" aria-hidden />
            {pending ? 'กำลังทำงาน…' : 'บันทึกและเผยแพร่'}
          </Button>
          {draftVersion && hasPublished ? (
            <Button type="button" variant="ghost" disabled={pending} onClick={discard}>
              <Undo2 className="size-4" aria-hidden />
              ยกเลิกร่าง
            </Button>
          ) : null}
          {msg ? (
            <span role={msg.ok ? 'status' : 'alert'} className={clsx('text-sm font-medium', msg.ok ? 'text-success-700' : 'text-danger-600')}>
              {msg.text}
            </span>
          ) : dirty ? (
            <span className="text-sm text-warning-700">มีการเปลี่ยนแปลงที่ยังไม่บันทึก</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const FIELD_NAMES: Record<string, string> = { x: 'X', y: 'Y', w: 'กว้าง', h: 'สูง', radius: 'มุมโค้ง', rotate: 'หมุน (°)', cx: 'จุดกลาง X', cy: 'จุดกลาง Y', r: 'รัศมี' };

function SlotFields<K extends string>({ fields, value, onChange }: { fields: readonly K[]; value: Record<string, number>; onChange: (k: K, v: number) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {fields.map((f) => (
        <label key={f} className="flex flex-col gap-1 text-xs text-ink-600">
          {FIELD_NAMES[f]}
          <input type="number" value={value[f] ?? 0} onChange={(e) => onChange(f, Number(e.target.value) || 0)} className="h-9 rounded-lg border border-ink-200 px-2 text-sm text-ink-900 tabular-nums" />
        </label>
      ))}
    </div>
  );
}

function TextFields({ slot, badge, onChange }: { slot: TextSlot; badge: boolean; onChange: (patch: Partial<TextSlot>) => void }) {
  const fixed = slot.text != null;
  const num = (k: keyof TextSlot, label: string) => (
    <label className="flex flex-col gap-1 text-xs text-ink-600">
      {label}
      <input type="number" value={(slot[k] as number | undefined) ?? ''} onChange={(e) => onChange({ [k]: e.target.value === '' ? undefined : Number(e.target.value) } as Partial<TextSlot>)} className="h-9 rounded-lg border border-ink-200 px-2 text-sm text-ink-900 tabular-nums" />
    </label>
  );
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="col-span-2 flex flex-col gap-1 text-xs text-ink-600">
          เนื้อหา
          <select
            value={fixed ? '__text' : slot.field}
            onChange={(e) => onChange(e.target.value === '__text' ? { field: undefined, text: slot.text ?? 'ข้อความ' } : { field: e.target.value as TextSlot['field'], text: undefined })}
            className="h-9 rounded-lg border border-ink-200 px-2 text-sm text-ink-900"
          >
            {TEMPLATE_TEXT_FIELDS.map((f) => (
              <option key={f} value={f}>
                {FIELD_LABELS[f]} (ตู้เติมให้)
              </option>
            ))}
            <option value="__text">ข้อความคงที่</option>
          </select>
        </label>
        {fixed ? (
          <label className="col-span-2 flex flex-col gap-1 text-xs text-ink-600">
            ข้อความ
            <input value={slot.text ?? ''} maxLength={120} onChange={(e) => onChange({ text: e.target.value })} className="h-9 rounded-lg border border-ink-200 px-2 text-sm text-ink-900" />
          </label>
        ) : null}
        <label className="flex flex-col gap-1 text-xs text-ink-600">
          ฟอนต์
          <select value={slot.font} onChange={(e) => onChange({ font: e.target.value as TextSlot['font'] })} className="h-9 rounded-lg border border-ink-200 px-2 text-sm text-ink-900">
            {TEMPLATE_FONTS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-600">
          น้ำหนัก
          <select value={slot.weight} onChange={(e) => onChange({ weight: Number(e.target.value) as TextSlot['weight'] })} className="h-9 rounded-lg border border-ink-200 px-2 text-sm text-ink-900">
            {[400, 500, 600, 700, 800].map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {num('x', 'X')}
        {num('y', 'Y')}
        {num('maxWidth', 'กว้างสุด')}
        {num('size', 'ขนาด')}
        {num('minSize', 'เล็กสุด')}
        {num('letterSpacing', 'ระยะตัวอักษร')}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <label className="flex flex-col gap-1 text-xs text-ink-600">
          สี
          <input type="color" value={slot.color} onChange={(e) => onChange({ color: e.target.value.toUpperCase() })} className="h-9 w-full rounded-lg border border-ink-200" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-600">
          จัดวาง
          <select value={slot.align} onChange={(e) => onChange({ align: e.target.value as TextSlot['align'] })} className="h-9 rounded-lg border border-ink-200 px-2 text-sm text-ink-900">
            <option value="left">ชิดซ้าย</option>
            <option value="center">กลาง</option>
            <option value="right">ชิดขวา</option>
          </select>
        </label>
        {badge ? (
          <label className="flex flex-col gap-1 text-xs text-ink-600">
            แนว
            <select value={slot.path} onChange={(e) => onChange({ path: e.target.value as TextSlot['path'] })} className="h-9 rounded-lg border border-ink-200 px-2 text-sm text-ink-900">
              <option value="straight">ตรง</option>
              <option value="arc-top">โค้งบน</option>
              <option value="arc-bottom">โค้งล่าง</option>
            </select>
          </label>
        ) : null}
      </div>
    </div>
  );
}

