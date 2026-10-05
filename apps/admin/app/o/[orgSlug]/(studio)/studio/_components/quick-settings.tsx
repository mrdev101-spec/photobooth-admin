'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import clsx from 'clsx';
import { Lock, X } from 'lucide-react';
import { APP_MODES } from '@photobooth/catalog';
import { buttonClass } from '@/components/ui';
import { quickSettingsViewAction, saveQuickSettingsAction, type QuickView } from './actions';

/**
 * ตั้งค่าด่วน: the fields (shared by the per-kiosk drawer, ตั้งค่างาน and Template ของงาน) and
 * the per-kiosk drawer. Only changed parts are sent; when a part comes from the kiosk's งาน /
 * ค่ากลาง the shop picks: every kiosk of that layer, or this kiosk only.
 */

export type QuickValues = QuickView['values'];
export type QuickPart = 'mode' | 'event' | 'payment' | 'products' | 'print' | 'templates';
export type CatalogEntry = { id: string; name: string; image?: string };
export const QUICK_SECTION: Record<QuickPart, string> = { mode: 'mode', event: 'brand', payment: 'payment', products: 'products', print: 'print', templates: 'templates' };
const PART_LABEL: Record<QuickPart, string> = { mode: 'โหมดตู้', event: 'ชื่องานบนภาพ', payment: 'การเก็บเงิน', products: 'ราคา', print: 'การพิมพ์', templates: 'กรอบ' };
const input = 'h-10 w-full min-w-0 rounded-md border border-ink-200 bg-white px-3 text-sm disabled:bg-ink-50';

export const changedParts = (v: QuickValues, base: QuickValues) => (Object.keys(QUICK_SECTION) as QuickPart[]).filter((k) => JSON.stringify(v[k]) !== JSON.stringify(base[k]));
export function patchOf(v: QuickValues, parts: QuickPart[]) {
  const patch: Record<string, unknown> = {};
  for (const k of parts) patch[k] = k === 'payment' ? { bypass: v.payment.bypass } : v[k];
  return patch;
}

function Box({ title, children, locked, note }: { title: string; children: React.ReactNode; locked?: boolean; note?: string }) {
  return (
    <fieldset disabled={locked} className="flex min-w-0 flex-col gap-3 rounded-lg border border-ink-200 bg-surface p-4">
      <legend className="flex flex-wrap items-center gap-2 px-1 text-sm font-semibold text-ink-900">
        {title}
        {locked ? (
          <span className="inline-flex items-center gap-1 text-xs font-normal text-ink-500">
            <Lock className="size-3" aria-hidden /> ผู้ให้บริการกำหนด
          </span>
        ) : note ? (
          <span className="text-xs font-normal text-ink-500">{note}</span>
        ) : null}
      </legend>
      {children}
    </fieldset>
  );
}

function Frames({ label, all, value, onChange, def, onDefault }: { label: string; all: CatalogEntry[]; value: string[]; onChange: (v: string[]) => void; def: string; onDefault: (v: string) => void }) {
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
      <span className="text-sm font-medium text-ink-700">
        {label} <span className="font-normal text-ink-500">• เปิด {offered.length}/{all.length}</span>
      </span>
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

/** The quick-settings boxes. `parts` limits which ones show; `note(part)` explains where a value lives. */
export function QuickFields({
  v,
  onChange,
  catalog,
  locked,
  note,
  parts = ['mode', 'event', 'payment', 'products', 'print', 'templates']
}: {
  v: QuickValues;
  onChange: (next: QuickValues) => void;
  catalog: { photo: CatalogEntry[]; badge: CatalogEntry[] };
  locked: (p: QuickPart) => boolean;
  note?: (p: QuickPart) => string | undefined;
  parts?: QuickPart[];
}) {
  const set = <K extends QuickPart>(k: K, patch: Partial<QuickValues[K]>) => onChange({ ...v, [k]: { ...v[k], ...patch } });
  const show = (p: QuickPart) => parts.includes(p);
  return (
    <div className="flex flex-col gap-4">
      {show('mode') ? (
        <Box title="โหมดตู้" locked={locked('mode')} note={note?.('mode')}>
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="โหมดตู้">
            {APP_MODES.map((m) => (
              <label key={m.id} className={clsx('flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm', v.mode.appMode === m.id ? 'border-primary-500 bg-primary-50' : 'border-ink-200')}>
                <input type="radio" name="quick-mode" checked={v.mode.appMode === m.id} onChange={() => set('mode', { appMode: m.id })} className="mt-0.5 size-4 accent-primary-600" />
                <span>
                  <span className="font-semibold text-ink-900">{m.name}</span>
                  <span className="block text-xs text-ink-500">{m.desc}</span>
                </span>
              </label>
            ))}
          </div>
          <p className="text-xs text-ink-500">ตู้เปลี่ยนโหมดเมื่อกลับถึงหน้าแรก (ไม่ขัดลูกค้าที่ใช้อยู่)</p>
        </Box>
      ) : null}
      {show('event') ? (
        <Box title="ชื่องานบนภาพ" locked={locked('event')} note={note?.('event')}>
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
      ) : null}

      {show('payment') ? (
        <Box title="การเก็บเงิน" locked={locked('payment')} note={note?.('payment')}>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" checked={v.payment.bypass} onChange={(e) => set('payment', { bypass: e.target.checked })} className="mt-0.5 size-5 accent-primary-600" />
            <span>
              <span className="font-medium text-ink-900">ใช้ฟรี (ไม่เก็บเงิน)</span>
              <span className="block text-ink-500">ลูกค้าข้ามหน้าชำระเงิน บันทึกเป็นออเดอร์ &quot;ใช้ฟรี&quot;</span>
            </span>
          </label>
        </Box>
      ) : null}

      {show('products') ? (
        <Box title="ราคา (บาท)" locked={locked('products')} note={note?.('products')}>
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
      ) : null}

      {show('print') ? (
        <Box title="การพิมพ์" locked={locked('print')} note={note?.('print')}>
          <label className="flex items-center gap-3 text-sm font-medium text-ink-900">
            <input type="checkbox" checked={v.print.enabled} onChange={(e) => set('print', { enabled: e.target.checked })} className="size-5 accent-primary-600" />
            เปิดการพิมพ์ที่ตู้ (ทุกโหมด)
          </label>
          {!v.print.enabled ? <p className="text-xs text-ink-500">ปิดอยู่: ลูกค้าเห็นภาพบนจอ + QR ดาวน์โหลด (ถ้าเปิดดาวน์โหลด)</p> : null}
          {(
            [
              ['photo', 'ตู้พิมพ์ภาพ (4x6)'],
              ['badge', 'ตู้พิมพ์เข็มกลัด'],
              ['queueSlip', 'พิมพ์ใบคิว']
            ] as const
          ).map(([k, label]) => (
            <label key={k} className={clsx('flex items-center gap-3 text-sm text-ink-900', !v.print.enabled && 'opacity-50')}>
              <input type="checkbox" checked={v.print[k]} disabled={!v.print.enabled} onChange={(e) => set('print', { [k]: e.target.checked })} className="size-5 accent-primary-600" />
              {label}
            </label>
          ))}
        </Box>
      ) : null}

      {show('templates') ? (
        <Box title="กรอบที่เปิดให้เลือก" locked={locked('templates')} note={note?.('templates')}>
          <Frames label="กรอบภาพ 4x6" all={catalog.photo} value={v.templates.photoLayouts} onChange={(x) => set('templates', { photoLayouts: x })} def={v.templates.photoDefaultLayout} onDefault={(x) => set('templates', { photoDefaultLayout: x })} />
          <Frames label="กรอบเข็มกลัด" all={catalog.badge} value={v.templates.badgeFrames} onChange={(x) => set('templates', { badgeFrames: x })} def={v.templates.badgeDefaultFrame} onDefault={(x) => set('templates', { badgeDefaultFrame: x })} />
        </Box>
      ) : null}
    </div>
  );
}

/** Per-kiosk drawer (from a kiosk card). */
export function QuickSettingsPanel({ orgSlug, kioskId, onClose, onSaved }: { orgSlug: string; kioskId: string; onClose: () => void; onSaved: (msg: { ok: boolean; text: string }) => void }) {
  const [view, setView] = useState<QuickView | null>(null);
  const [v, setV] = useState<QuickValues | null>(null);
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

  const changed = useMemo(() => (view && v ? changedParts(v, view.values) : []), [view, v]);
  const isOwn = (p: QuickPart) => !!view?.own.includes(QUICK_SECTION[p] as never);
  // Changed parts this kiosk sets itself: "every kiosk" also brings it back to the layer for them
  const owned = changed.filter((k) => isOwn(k));

  const save = (target: 'source' | 'kiosk') =>
    start(async () => {
      if (!v) return;
      const r = await saveQuickSettingsAction(orgSlug, { kioskRowId: kioskId, target, release: target === 'source', patch: patchOf(v, changed) });
      setAsking(false);
      if (r.ok) {
        onSaved({ ok: true, text: r.message });
        onClose();
      } else setError(r.message);
    });
  const onSave = () => {
    setError('');
    if (changed.length && view?.canSource) setAsking(true);
    else save('kiosk');
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" role="dialog" aria-modal="true" aria-label="ตั้งค่าด่วน" onClick={onClose}>
      <div className="flex h-full w-full max-w-xl flex-col bg-canvas shadow-xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between gap-3 border-b border-ink-200 bg-surface px-5 py-3">
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
            <QuickFields
              v={v}
              onChange={setV}
              catalog={view.catalog}
              locked={(p) => view.locked.includes(QUICK_SECTION[p] as never)}
              note={(p) => (isOwn(p) ? `ตู้นี้ตั้งเอง (ไม่ตาม${view.source.label})` : undefined)}
            />
          )}
        </div>

        <footer className="flex flex-col gap-3 border-t border-ink-200 bg-surface px-5 py-3">
          {error && v ? <p className="text-sm text-danger-600">{error}</p> : null}
          {asking && view ? (
            <div className="flex flex-col gap-2 rounded-lg bg-primary-50 p-3">
              <p className="text-sm text-ink-900">
                ตู้นี้ใช้ค่าจาก<b>{view.source.label}</b> ค่าที่แก้จะใช้กับตู้ไหน?
              </p>
              {owned.length ? (
                <p className="text-xs text-warning-800">
                  หมวด {owned.map((k) => PART_LABEL[k]).join(', ')} ตู้นี้ตั้งเองอยู่ ถ้าเลือก &quot;ทุกตู้&quot; ตู้นี้จะกลับมาใช้ค่าของ{view.source.label}ในหมวดนี้ด้วย
                </p>
              ) : null}
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
              <p className="text-xs text-ink-500">เฉพาะตู้นี้ = หมวดนั้นจะเป็นค่าเฉพาะตู้ ไม่เปลี่ยนตาม{view.source.label}อีก (ให้กลับมาใช้ค่าของงานได้ที่หน้า &quot;ตั้งค่างาน&quot;)</p>
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
