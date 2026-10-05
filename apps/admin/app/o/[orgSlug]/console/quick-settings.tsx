'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import clsx from 'clsx';
import { Lock, X } from 'lucide-react';
import { buttonClass } from '@/components/ui';
import { quickSettingsViewAction, saveQuickSettingsAction, type QuickView } from './actions';

/**
 * Event Console › ตั้งค่าด่วน for one kiosk. Only the parts that changed are sent; when a part
 * comes from the kiosk's งาน / ค่ากลาง the shop picks: every kiosk of that layer, or this kiosk only.
 */

type Values = QuickView['values'];
type Part = 'event' | 'payment' | 'products' | 'print' | 'templates';
const SECTION: Record<Part, string> = { event: 'brand', payment: 'payment', products: 'products', print: 'print', templates: 'templates' };
const input = 'h-10 w-full min-w-0 rounded-md border border-ink-200 bg-white px-3 text-sm disabled:bg-ink-50';

function Box({ title, children, locked, own }: { title: string; children: React.ReactNode; locked?: boolean; own?: boolean }) {
  return (
    <fieldset disabled={locked} className="flex min-w-0 flex-col gap-3 rounded-lg border border-ink-200 p-4">
      <legend className="flex items-center gap-2 px-1 text-sm font-semibold text-ink-900">
        {title}
        {locked ? (
          <span className="inline-flex items-center gap-1 text-xs font-normal text-ink-500">
            <Lock className="size-3" aria-hidden /> ผู้ให้บริการกำหนด
          </span>
        ) : own ? (
          <span className="text-xs font-normal text-ink-500">ตั้งเฉพาะตู้นี้อยู่แล้ว</span>
        ) : null}
      </legend>
      {children}
    </fieldset>
  );
}

function Frames({ label, all, value, onChange, def, onDefault }: { label: string; all: { id: string; name: string; image?: string }[]; value: string[]; onChange: (v: string[]) => void; def: string; onDefault: (v: string) => void }) {
  const everything = value.length === 0;
  const on = (id: string) => everything || value.includes(id);
  const toggle = (id: string) => {
    const cur = everything ? all.map((t) => t.id) : value;
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    if (!next.length) return; // at least one stays on
    onChange(next.length === all.length ? [] : next);
    if (!next.includes(def)) onDefault(next[0]!);
  };
  const offered = all.filter((t) => on(t.id));
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span className="text-sm font-medium text-ink-700">{label}</span>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {all.map((t) => (
          <button key={t.id} type="button" onClick={() => toggle(t.id)} className={clsx('relative flex w-16 shrink-0 flex-col items-center gap-1 rounded-lg border p-1 text-[11px]', on(t.id) ? 'border-primary-500 bg-primary-50' : 'border-ink-200 opacity-50')} title={t.name}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {t.image ? <img src={t.image} alt="" className="aspect-[2/3] w-full rounded object-cover" /> : <span className="aspect-[2/3] w-full rounded bg-ink-100" />}
            <span className="w-full truncate">{t.name}</span>
            {def === t.id ? <span className="absolute right-0.5 top-0.5 rounded bg-primary-600 px-1 text-[10px] text-white">เริ่มต้น</span> : null}
          </button>
        ))}
      </div>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-ink-600">กรอบเริ่มต้น</span>
        <select className={input} value={def} onChange={(e) => onDefault(e.target.value)}>
          {offered.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

export function QuickSettingsPanel({ orgSlug, kioskId, onClose, onSaved }: { orgSlug: string; kioskId: string; onClose: () => void; onSaved: (msg: { ok: boolean; text: string }) => void }) {
  const [view, setView] = useState<QuickView | null>(null);
  const [v, setV] = useState<Values | null>(null);
  const [error, setError] = useState('');
  const [asking, setAsking] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    let alive = true;
    quickSettingsViewAction(orgSlug, kioskId).then((r) => {
      if (!alive) return;
      if (r.ok) {
        setView(r.view);
        setV(structuredClone(r.view.values));
      } else setError(r.message);
    });
    return () => {
      alive = false;
    };
  }, [orgSlug, kioskId]);

  const changed = useMemo(() => {
    if (!view || !v) return [] as Part[];
    return (Object.keys(SECTION) as Part[]).filter((k) => JSON.stringify(v[k]) !== JSON.stringify(view.values[k]));
  }, [view, v]);
  // Parts that would change the layer (not set on this kiosk already)
  const shared = view ? changed.filter((k) => !view.own.includes(SECTION[k] as never)) : [];

  const save = (target: 'source' | 'kiosk') =>
    start(async () => {
      if (!v) return;
      const patch: Record<string, unknown> = {};
      for (const k of changed) patch[k] = k === 'payment' ? { bypass: v.payment.bypass } : v[k];
      const r = await saveQuickSettingsAction(orgSlug, { kioskRowId: kioskId, target, patch });
      setAsking(false);
      if (r.ok) {
        onSaved({ ok: true, text: r.message });
        onClose();
      } else setError(r.message);
    });
  const onSave = () => {
    setError('');
    if (shared.length && view?.canSource) setAsking(true);
    else save('kiosk');
  };

  const locked = (p: Part) => !!view?.locked.includes(SECTION[p] as never);
  const own = (p: Part) => !!view?.own.includes(SECTION[p] as never);
  const set = <K extends Part>(k: K, patch: Partial<Values[K]>) => setV((cur) => (cur ? { ...cur, [k]: { ...cur[k], ...patch } } : cur));

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" role="dialog" aria-modal="true" aria-label="ตั้งค่าด่วน" onClick={onClose}>
      <div className="flex h-full w-full max-w-xl flex-col bg-surface shadow-xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between gap-3 border-b border-ink-200 px-5 py-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-ink-900">ตั้งค่าด่วน</h2>
            <p className="truncate text-sm text-ink-500">{view ? `${view.kiosk.name} • ใช้ค่าจาก${view.source.label}` : 'กำลังโหลด…'}</p>
          </div>
          <button type="button" onClick={onClose} className={buttonClass('ghost', 'icon')} aria-label="ปิด">
            <X aria-hidden />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {!v || !view ? (
            <p className="text-sm text-ink-500">{error || 'กำลังโหลด…'}</p>
          ) : (
            <div className="flex flex-col gap-4">
              <Box title="ชื่องานบนภาพ" locked={locked('event')} own={own('event')}>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-ink-600">ชื่องาน</span>
                  <input className={input} value={v.event.title} maxLength={80} onChange={(e) => set('event', { title: e.target.value })} />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-ink-600">ข้อความรอง</span>
                  <input className={input} value={v.event.subtitle} maxLength={120} onChange={(e) => set('event', { subtitle: e.target.value })} />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-ink-600">วันที่ (ว่าง = วันที่พิมพ์)</span>
                  <input className={input} value={v.event.date} maxLength={40} onChange={(e) => set('event', { date: e.target.value })} />
                </label>
              </Box>

              <Box title="การเก็บเงิน" locked={locked('payment')} own={own('payment')}>
                <label className="flex items-start gap-3 text-sm">
                  <input type="checkbox" checked={v.payment.bypass} onChange={(e) => set('payment', { bypass: e.target.checked })} className="mt-0.5 size-5 accent-primary-600" />
                  <span>
                    <span className="font-medium text-ink-900">ใช้ฟรี (ไม่เก็บเงิน)</span>
                    <span className="block text-ink-500">ลูกค้าข้ามหน้าชำระเงิน บันทึกเป็นออเดอร์ "ใช้ฟรี"</span>
                  </span>
                </label>
              </Box>

              <Box title="ราคา (บาท)" locked={locked('products')} own={own('products')}>
                <div className="grid grid-cols-2 gap-3">
                  {(
                    [
                      ['photo', 'ภาพ 4x6'],
                      ['badge', 'เข็มกลัด'],
                      ['bundle', 'ภาพ + เข็มกลัด'],
                      ['ai', 'AI ต่อภาพ']
                    ] as const
                  ).map(([k, label]) => (
                    <label key={k} className="flex flex-col gap-1 text-sm">
                      <span className="text-ink-600">{label}</span>
                      <input type="number" className={input} min={0} max={100000} value={v.products[k]} onChange={(e) => set('products', { [k]: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
                    </label>
                  ))}
                </div>
              </Box>

              <Box title="การพิมพ์" locked={locked('print')} own={own('print')}>
                {(
                  [
                    ['photo', 'ตู้พิมพ์ภาพ'],
                    ['badge', 'ตู้พิมพ์เข็มกลัด'],
                    ['queueSlip', 'พิมพ์ใบคิว']
                  ] as const
                ).map(([k, label]) => (
                  <label key={k} className="flex items-center gap-3 text-sm text-ink-900">
                    <input type="checkbox" checked={v.print[k]} onChange={(e) => set('print', { [k]: e.target.checked })} className="size-5 accent-primary-600" />
                    {label}
                  </label>
                ))}
              </Box>

              <Box title="กรอบที่เปิดให้เลือก" locked={locked('templates')} own={own('templates')}>
                <Frames label="กรอบภาพ 4x6" all={view.catalog.photo} value={v.templates.photoLayouts} onChange={(x) => set('templates', { photoLayouts: x })} def={v.templates.photoDefaultLayout} onDefault={(x) => set('templates', { photoDefaultLayout: x })} />
                <Frames label="กรอบเข็มกลัด" all={view.catalog.badge} value={v.templates.badgeFrames} onChange={(x) => set('templates', { badgeFrames: x })} def={v.templates.badgeDefaultFrame} onDefault={(x) => set('templates', { badgeDefaultFrame: x })} />
              </Box>
            </div>
          )}
        </div>

        <footer className="flex flex-col gap-3 border-t border-ink-200 px-5 py-3">
          {error && v ? <p className="text-sm text-danger-600">{error}</p> : null}
          {asking && view ? (
            <div className="flex flex-col gap-2 rounded-lg bg-primary-50 p-3">
              <p className="text-sm text-ink-900">
                {shared.length === changed.length ? 'ค่าที่แก้' : 'บางส่วนของค่าที่แก้'}มาจาก<b>{view.source.label}</b> จะใช้กับตู้ไหน?
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={pending} onClick={() => save('source')} className={buttonClass('primary', 'sm')}>
                  ทุกตู้ที่ใช้{view.source.label} ({view.source.kiosks} ตู้)
                </button>
                <button type="button" disabled={pending} onClick={() => save('kiosk')} className={buttonClass('outline', 'sm')}>
                  เฉพาะตู้นี้
                </button>
                <button type="button" disabled={pending} onClick={() => setAsking(false)} className={buttonClass('ghost', 'sm')}>
                  ยกเลิก
                </button>
              </div>
              <p className="text-xs text-ink-500">เฉพาะตู้นี้ = หมวดนั้นจะเป็นค่าเฉพาะตู้ ไม่เปลี่ยนตาม{view.source.label}อีก (กลับไปใช้ค่ากลางได้ที่หน้าตั้งค่าตู้)</p>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-ink-500">{changed.length ? `แก้ ${changed.length} หมวด` : 'ยังไม่มีการเปลี่ยนแปลง'}</span>
              <button type="button" disabled={!changed.length || pending} onClick={onSave} className={buttonClass('primary', 'md')}>
                {pending ? 'กำลังบันทึก…' : 'บันทึกและส่งไปตู้'}
              </button>
            </div>
          )}
        </footer>
      </div>
    </div>
  );
}
