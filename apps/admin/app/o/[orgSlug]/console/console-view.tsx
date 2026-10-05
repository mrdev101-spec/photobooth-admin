'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { Ban, Banknote, Camera, Clock, ExternalLink, Images, MonitorSmartphone, Printer, Radio, ReceiptText, RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import { Badge, Card, StatCard, buttonClass, type Tone } from '@/components/ui';
import { CONNECTION_LABEL } from '@/lib/kiosk-status';
import { productLabel } from '@/lib/order-labels';
import { formatBaht, formatNumber } from '@/lib/format';
import type { ConsoleFeed, ConsoleFilter } from '@/server/services/event-console';
import { orderCommandAction } from '../orders/actions';
import { QuickSettingsPanel } from './quick-settings';

const POLL_MS = 3000;

const SCREEN: Record<string, string> = {
  ATTRACT: 'หน้าแรก (ว่าง)',
  PRODUCT: 'เลือกสินค้า',
  SELECT: 'เลือกกรอบ',
  PAYMENT: 'ชำระเงิน',
  CAMERA: 'กำลังถ่ายภาพ',
  EDIT: 'แต่งภาพ',
  BADGE: 'จัดเข็มกลัด',
  PRINT: 'กำลังพิมพ์',
  PICKUP: 'รับภาพ',
  config: 'เจ้าหน้าที่เปิดตั้งค่า',
  admin: 'เจ้าหน้าที่ใส่รหัส',
  pickup: 'จุดรับรูป'
};
const PRINTER_ROLE: Record<string, string> = { main: 'ใบเสร็จ', photo: 'ภาพ', badge: 'เข็มกลัด' };
const JOB_KIND: Record<string, string> = { photo: 'แผ่นภาพ', badge: 'เข็มกลัด', slip: 'ใบคิว' };
const JOB_STATUS: Record<string, { label: string; tone: Tone }> = {
  queued: { label: 'รอพิมพ์', tone: 'info' },
  printing: { label: 'กำลังพิมพ์', tone: 'warning' },
  printed: { label: 'พิมพ์แล้ว', tone: 'success' },
  failed: { label: 'ล้มเหลว', tone: 'danger' },
  cancelled: { label: 'ยกเลิก', tone: 'neutral' }
};
const CMD_LABEL: Record<string, string> = { reprint: 'พิมพ์ซ้ำ', cancel_print: 'ยกเลิกคิว' };
const CMD_STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: 'รอตู้รับ', tone: 'info' },
  sent: { label: 'ตู้กำลังทำ', tone: 'warning' },
  done: { label: 'สำเร็จ', tone: 'success' },
  failed: { label: 'ไม่สำเร็จ', tone: 'danger' }
};

const time = (iso: string) => new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Bangkok' });

export function ConsoleView({
  orgSlug,
  initial,
  events,
  initialFilter,
  canAct,
  canOrders,
  canQuick = false
}: {
  orgSlug: string;
  initial: ConsoleFeed;
  events: { id: string; name: string }[];
  initialFilter: ConsoleFilter;
  canAct: boolean;
  canOrders: boolean;
  /** Owner / manager: ตั้งค่าด่วน */
  canQuick?: boolean;
}) {
  const [quickFor, setQuickFor] = useState<string | null>(null);
  const [feed, setFeed] = useState(initial);
  const [filter, setFilter] = useState<ConsoleFilter>(initialFilter);
  const [stale, setStale] = useState(false);
  const [, tick] = useState(0);
  const [photo, setPhoto] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const filterRef = useRef(filter);
  filterRef.current = filter;

  const load = useCallback(async () => {
    const f = filterRef.current;
    const q = new URLSearchParams();
    if (f.eventId) q.set('event', f.eventId);
    if (f.kioskId) q.set('kiosk', f.kioskId);
    try {
      const res = await fetch(`/o/${orgSlug}/console/feed?${q}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      setFeed(await res.json());
      setStale(false);
    } catch {
      setStale(true);
    }
  }, [orgSlug]);

  useEffect(() => {
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') load();
      tick((n) => n + 1);
    }, POLL_MS);
    return () => window.clearInterval(t);
  }, [load]);

  const pickFilter = (next: ConsoleFilter) => {
    setFilter(next);
    filterRef.current = next;
    const q = new URLSearchParams();
    if (next.eventId) q.set('event', next.eventId);
    if (next.kioskId) q.set('kiosk', next.kioskId);
    window.history.replaceState(null, '', `/o/${orgSlug}/console${q.size ? `?${q}` : ''}`);
    load();
  };

  const command = (orderId: string, type: 'reprint' | 'cancel_print') =>
    start(async () => {
      const r = await orderCommandAction(orgSlug, orderId, type, { ok: true });
      setMsg({ ok: !!r.ok, text: r.message ?? (r.ok ? 'ส่งคำสั่งแล้ว' : 'ส่งคำสั่งไม่สำเร็จ') });
      load();
    });

  const age = Math.round((Date.now() - Date.parse(feed.at)) / 1000);
  const active = feed.jobs.filter((j) => j.status === 'printing' || j.status === 'queued' || j.status === 'failed');
  const s = feed.summary;
  const current = feed.photos.find((p) => p.orderId === photo);
  const maxHour = s ? Math.max(1, ...s.byHour.map((h) => h.orders)) : 1;

  return (
    <div className="flex flex-col gap-5">
      {/* Header + filters */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-ink-900">
            <Radio className="size-6 text-primary-600" aria-hidden />
            Event Console
          </h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-ink-500">
            <span className={`inline-block size-2 rounded-full ${stale ? 'bg-danger-600' : 'animate-pulse bg-success-600'}`} aria-hidden />
            {stale ? 'เชื่อมต่อไม่ได้ กำลังลองใหม่…' : `อัปเดตเมื่อ ${age < 2 ? 'เมื่อสักครู่' : `${age} วินาทีที่แล้ว`}`} • ข้อมูลของวันนี้
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            aria-label="งาน"
            className="h-10 rounded-lg border border-ink-300 bg-surface px-3 text-sm"
            value={filter.eventId ?? ''}
            onChange={(e) => pickFilter({ eventId: e.target.value || null, kioskId: null })}
          >
            <option value="">ทุกงาน / ทุกตู้</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                งาน: {ev.name}
              </option>
            ))}
          </select>
          <select
            aria-label="ตู้"
            className="h-10 rounded-lg border border-ink-300 bg-surface px-3 text-sm"
            value={filter.kioskId ?? ''}
            onChange={(e) => pickFilter({ ...filter, kioskId: e.target.value || null })}
          >
            <option value="">ทุกตู้</option>
            {feed.kiosks.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {msg ? (
        <div role="status" className={`flex items-center justify-between gap-3 rounded-lg px-4 py-2 text-sm font-medium ${msg.ok ? 'bg-success-50 text-success-700' : 'bg-danger-50 text-danger-700'}`}>
          {msg.text}
          <button type="button" onClick={() => setMsg(null)} aria-label="ปิด">
            <X className="size-4" aria-hidden />
          </button>
        </div>
      ) : null}

      {/* Kiosks */}
      {feed.kiosks.length ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {feed.kiosks.map((k) => {
            const c = CONNECTION_LABEL[k.connection];
            const bad = k.printers.filter((p) => !p.ok);
            return (
              <div key={k.id} className={`rounded-card border bg-surface p-4 shadow-card ${bad.length || k.connection === 'offline' ? 'border-danger-300' : 'border-ink-200'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 truncate font-semibold text-ink-900">
                      <MonitorSmartphone className="size-4 shrink-0 text-primary-600" aria-hidden />
                      {k.name}
                    </p>
                    <p className="text-xs text-ink-500">{k.branch ?? '—'}</p>
                  </div>
                  <Badge tone={c.tone} dot>
                    {c.label}
                  </Badge>
                </div>
                <p className="mt-3 text-sm text-ink-700">
                  <span className="text-ink-500">หน้าจอ:</span> {k.connection === 'online' ? (SCREEN[k.screen ?? ''] ?? k.screen ?? '—') : '—'}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {k.printers.length ? (
                    k.printers.map((p) => (
                      <Badge key={`${p.role}${p.name}`} tone={p.ok ? 'success' : 'danger'} dot>
                        {PRINTER_ROLE[p.role] ?? p.role}: {p.ok ? 'ปกติ' : (p.error ?? 'มีปัญหา')}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-xs text-ink-400">ยังไม่มีข้อมูลเครื่องพิมพ์</span>
                  )}
                  {k.maintenance ? <Badge tone="warning">ปิดปรับปรุง</Badge> : null}
                  {k.emergency ? <Badge tone="danger">โหมดฉุกเฉิน</Badge> : null}
                  {k.settingsPending ? <Badge tone="info">รอใช้การตั้งค่าใหม่</Badge> : null}
                </div>
                {canQuick ? (
                  <button type="button" onClick={() => setQuickFor(k.id)} className={`${buttonClass('outline', 'sm')} mt-3`}>
                    <SlidersHorizontal aria-hidden /> ตั้งค่าด่วน
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <Card>
          <p className="text-ink-500">ไม่มีตู้ในตัวกรองนี้</p>
        </Card>
      )}

      {/* Day summary (owner / manager) */}
      {s ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="ออเดอร์วันนี้" value={formatNumber(s.orders)} icon={<ReceiptText aria-hidden />} tone="primary" />
          <StatCard label="ยอดเงินจริง" value={formatBaht(s.bySatang.live.satang / 100)} hint={`${formatNumber(s.bySatang.live.orders)} ออเดอร์`} icon={<Banknote aria-hidden />} />
          <StatCard
            label="ทดสอบ / จำลอง"
            value={formatBaht((s.bySatang.test.satang + s.bySatang.simulated.satang) / 100)}
            hint={`${formatNumber(s.bySatang.test.orders + s.bySatang.simulated.orders)} ออเดอร์ (ไม่ใช่เงินจริง)`}
            icon={<Banknote aria-hidden />}
          />
          <StatCard label="ใช้ฟรี" value={formatNumber(s.bySatang.free.orders)} hint="ออเดอร์ที่ไม่เก็บเงิน" icon={<Camera aria-hidden />} />
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-5">
        {/* Print queue */}
        <Card
          className="xl:col-span-3"
          flush
          title={`คิวพิมพ์${active.length ? ` • ต้องดู ${active.length}` : ''}`}
          subtitle="สถานะจากคิวเครื่องพิมพ์ของตู้ • พิมพ์ซ้ำใช้ไฟล์ในตู้ (เก็บ 2 วัน)"
          icon={<Printer aria-hidden />}
        >
          {feed.jobs.length ? (
            <div className="max-h-[32rem] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface text-left text-xs text-ink-500">
                  <tr>
                    <th className="px-4 py-2 font-medium">เวลา</th>
                    <th className="px-2 py-2 font-medium">คิว</th>
                    <th className="px-2 py-2 font-medium">ตู้ / งาน</th>
                    <th className="px-2 py-2 font-medium">สถานะ</th>
                    <th className="px-4 py-2 text-right font-medium">{canAct ? 'สั่งงาน' : ''}</th>
                  </tr>
                </thead>
                <tbody>
                  {feed.jobs.map((j) => {
                    const st = JOB_STATUS[j.status] ?? { label: j.status, tone: 'neutral' as Tone };
                    const needs = j.status === 'failed' || j.status === 'printing' || j.status === 'queued';
                    return (
                      <tr key={j.id} className={`border-t border-ink-100 align-top ${j.status === 'failed' ? 'bg-danger-50/60' : ''}`}>
                        <td className="px-4 py-2 whitespace-nowrap text-ink-600 tabular-nums">{time(j.updatedAt)}</td>
                        <td className="px-2 py-2 font-mono font-semibold text-ink-900">{j.queueNo ?? '—'}</td>
                        <td className="px-2 py-2">
                          <span className="text-ink-900">{j.kiosk}</span>
                          <span className="block text-xs text-ink-500">
                            {JOB_KIND[j.kind] ?? j.kind} • {productLabel(j.product)}
                          </span>
                        </td>
                        <td className="px-2 py-2">
                          <Badge tone={st.tone} dot>
                            {st.label}
                          </Badge>
                          {j.attempts > 1 ? <span className="ml-1 text-xs text-ink-500">ครั้งที่ {j.attempts}</span> : null}
                          {j.error ? <span className="block max-w-56 text-xs text-danger-700">{j.error}</span> : null}
                        </td>
                        <td className="px-4 py-2 text-right whitespace-nowrap">
                          {canAct && j.kind !== 'slip' ? (
                            <div className="flex justify-end gap-1">
                              <button type="button" disabled={pending} onClick={() => command(j.orderId, 'reprint')} className={buttonClass('outline', 'sm')} title="พิมพ์ซ้ำที่ตู้">
                                <RotateCcw className="size-4" aria-hidden />
                                พิมพ์ซ้ำ
                              </button>
                              {needs ? (
                                <button type="button" disabled={pending} onClick={() => command(j.orderId, 'cancel_print')} className={buttonClass('ghost', 'sm')} title="ยกเลิกงานที่ค้างในคิว">
                                  <Ban className="size-4" aria-hidden />
                                  ยกเลิก
                                </button>
                              ) : null}
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-5 py-6 text-ink-500">ยังไม่มีงานพิมพ์วันนี้</p>
          )}
          {feed.commands.length ? (
            <div className="border-t border-ink-100 px-4 py-3">
              <p className="mb-2 text-xs font-medium text-ink-500">คำสั่งล่าสุด</p>
              <ul className="flex flex-col gap-1 text-sm">
                {feed.commands.slice(0, 5).map((c) => {
                  const cs = CMD_STATUS[c.status] ?? { label: c.status, tone: 'neutral' as Tone };
                  return (
                    <li key={c.id} className="flex flex-wrap items-center gap-2">
                      <span className="text-ink-500 tabular-nums">{time(c.createdAt)}</span>
                      <span className="text-ink-900">{CMD_LABEL[c.type] ?? c.type}</span>
                      <Badge tone={cs.tone}>{cs.label}</Badge>
                      {c.message ? <span className="text-ink-500">{c.message}</span> : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </Card>

        {/* Live photos */}
        <Card className="xl:col-span-2" title="ภาพล่าสุด" subtitle={`${feed.photos.length} ภาพล่าสุดของวันนี้ • แตะเพื่อดูและสั่งงาน`} icon={<Images aria-hidden />}>
          {feed.photos.length ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-3">
              {feed.photos.map((p) => (
                <button key={p.orderId} type="button" onClick={() => setPhoto(p.orderId)} className="group relative overflow-hidden rounded-lg border border-ink-200 bg-ink-50 text-left focus:ring-2 focus:ring-primary-300 focus:outline-none">
                  {p.hasThumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/o/${orgSlug}/orders/${p.orderId}/thumb`} alt={`ภาพคิว ${p.queueNo ?? ''}`} loading="lazy" className="aspect-[2/3] w-full object-cover transition-transform group-hover:scale-105" />
                  ) : (
                    <span className="flex aspect-[2/3] items-center justify-center text-xs text-ink-400">ไม่มีภาพย่อ</span>
                  )}
                  <span className="absolute inset-x-0 bottom-0 flex justify-between bg-ink-900/60 px-1.5 py-0.5 text-[11px] text-white">
                    <span className="font-mono font-semibold">{p.queueNo ?? '—'}</span>
                    <span className="tabular-nums">{time(p.orderedAt).slice(0, 5)}</span>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-ink-500">ยังไม่มีภาพวันนี้</p>
          )}
        </Card>
      </div>

      {s && (s.byProduct.length || s.byHour.length) ? (
        <div className="grid gap-5 lg:grid-cols-3">
          <Card title="ตามสินค้า" icon={<ReceiptText aria-hidden />}>
            <ul className="flex flex-col gap-2 text-sm">
              {s.byProduct.map((p) => (
                <li key={p.product} className="flex justify-between gap-3">
                  <span className="text-ink-900">{productLabel(p.product)}</span>
                  <span className="text-ink-600 tabular-nums">
                    {formatNumber(p.orders)} • {formatBaht(p.satang / 100)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
          <Card title="ตามตู้" icon={<MonitorSmartphone aria-hidden />}>
            <ul className="flex flex-col gap-2 text-sm">
              {s.byKiosk.map((k) => (
                <li key={k.kiosk} className="flex justify-between gap-3">
                  <span className="text-ink-900">{k.kiosk}</span>
                  <span className="text-ink-600 tabular-nums">
                    {formatNumber(k.orders)} • {formatBaht(k.satang / 100)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
          <Card title="รายชั่วโมง" icon={<Clock aria-hidden />}>
            <div className="flex h-32 items-end gap-1" role="img" aria-label="จำนวนออเดอร์รายชั่วโมง">
              {s.byHour.map((h) => (
                <div key={h.hour} className="flex flex-1 flex-col items-center gap-1" title={`${h.hour}:00 • ${h.orders} ออเดอร์`}>
                  <span className="text-[10px] text-ink-600 tabular-nums">{h.orders}</span>
                  <div className="w-full rounded-t bg-primary-500" style={{ height: `${Math.max(4, (h.orders / maxHour) * 88)}px` }} />
                  <span className="text-[10px] text-ink-500 tabular-nums">{h.hour}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      ) : null}

      {/* Photo viewer */}
      {current ? (
        <div role="dialog" aria-modal="true" aria-label="ภาพของออเดอร์" className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/70 p-4" onClick={() => setPhoto(null)}>
          <div className="w-full max-w-md rounded-card bg-surface p-4 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-ink-900">
                  คิว <span className="font-mono">{current.queueNo ?? '—'}</span> • {productLabel(current.product)}
                </p>
                <p className="text-sm text-ink-500">
                  {current.kiosk} • {time(current.orderedAt)}
                </p>
              </div>
              <button type="button" onClick={() => setPhoto(null)} className={buttonClass('ghost', 'icon')} aria-label="ปิด">
                <X className="size-5" aria-hidden />
              </button>
            </div>
            {current.hasThumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/o/${orgSlug}/orders/${current.orderId}/thumb`} alt="ภาพของออเดอร์" className="mx-auto max-h-[60vh] rounded-lg border border-ink-200 object-contain" />
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              {canAct ? (
                <>
                  <button type="button" disabled={pending} onClick={() => command(current.orderId, 'reprint')} className={buttonClass('primary', 'sm')}>
                    <RotateCcw className="size-4" aria-hidden />
                    พิมพ์ซ้ำที่ตู้
                  </button>
                  <button type="button" disabled={pending} onClick={() => command(current.orderId, 'cancel_print')} className={buttonClass('outline', 'sm')}>
                    <Ban className="size-4" aria-hidden />
                    ยกเลิกคิวพิมพ์
                  </button>
                </>
              ) : null}
              {canOrders ? (
                <Link href={`/o/${orgSlug}/orders/${current.orderId}`} className={buttonClass('ghost', 'sm')}>
                  <ExternalLink className="size-4" aria-hidden />
                  รายละเอียดออเดอร์
                </Link>
              ) : null}
            </div>
            <p className="mt-2 text-xs text-ink-500">
              สถานะ: {current.status === 'printed_at_kiosk' ? 'พิมพ์ที่ตู้แล้ว' : current.status}
            </p>
          </div>
        </div>
      ) : null}
      {quickFor ? (
        <QuickSettingsPanel
          orgSlug={orgSlug}
          kioskId={quickFor}
          onClose={() => setQuickFor(null)}
          onSaved={(m) => {
            setMsg(m);
            void load();
          }}
        />
      ) : null}
    </div>
  );
}
