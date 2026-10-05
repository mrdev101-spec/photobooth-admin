'use client';

import Link from 'next/link';
import { useState } from 'react';
import clsx from 'clsx';
import { Ban, Banknote, Camera, Clock, ExternalLink, Images, MonitorSmartphone, Printer, ReceiptText, RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import { Badge, Card, StatCard, buttonClass, type Tone } from '@/components/ui';
import { CONNECTION_LABEL } from '@/lib/kiosk-status';
import { productLabel } from '@/lib/order-labels';
import { formatBaht, formatNumber } from '@/lib/format';
import { QuickSettingsPanel } from './quick-settings';
import { useStudio } from './studio-shell';

/** Live parts of Event Studio; each reads the shared feed (useStudio). */

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
const ORDER_STATUS: Record<string, string> = {
  uploaded: 'รอรับที่จุดรับรูป',
  printed_at_kiosk: 'พิมพ์ที่ตู้แล้ว',
  claimed: 'กำลังพิมพ์ที่จุดรับรูป',
  handed_over: 'ส่งมอบแล้ว',
  expired: 'หมดอายุ',
  cancelled: 'ยกเลิก'
};

export const time = (iso: string) => new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Bangkok' });

/** Kiosk cards: connection, screen, printers, and ตั้งค่าด่วน per kiosk. */
export function KioskGrid({ compact = false }: { compact?: boolean }) {
  const { feed, canQuick, orgSlug, notify, load } = useStudio();
  const [quickFor, setQuickFor] = useState<string | null>(null);
  if (!feed.kiosks.length) {
    return (
      <Card>
        <p className="text-ink-500">ไม่มีตู้ในงานนี้ • เลือกตู้เข้างานได้ที่หน้าตั้งค่าตู้ (ค่ากลางและงาน)</p>
      </Card>
    );
  }
  return (
    <>
      <div className={clsx('grid gap-3', compact ? 'sm:grid-cols-2 xl:grid-cols-4' : 'sm:grid-cols-2 xl:grid-cols-3')}>
        {feed.kiosks.map((k) => {
          const c = CONNECTION_LABEL[k.connection];
          const bad = k.printers.filter((p) => !p.ok);
          return (
            <div key={k.id} className={clsx('rounded-card border bg-surface p-4 shadow-card', bad.length || k.connection === 'offline' ? 'border-danger-300' : 'border-ink-200')}>
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
              {!compact ? (
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
              ) : bad.length ? (
                <p className="mt-1 text-xs text-danger-700">เครื่องพิมพ์มีปัญหา {bad.length} เครื่อง</p>
              ) : null}
              {canQuick && !compact ? (
                <button type="button" onClick={() => setQuickFor(k.id)} className={`${buttonClass('outline', 'sm')} mt-3`}>
                  <SlidersHorizontal aria-hidden /> ตั้งค่าด่วน (ตู้นี้)
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
      {quickFor ? (
        <QuickSettingsPanel
          orgSlug={orgSlug}
          kioskId={quickFor}
          onClose={() => setQuickFor(null)}
          onSaved={(m) => {
            notify(m);
            void load();
          }}
        />
      ) : null}
    </>
  );
}

/** Print queue with reprint / cancel, and the latest commands. */
export function PrintQueue({ onlyActive = false, limit }: { onlyActive?: boolean; limit?: number }) {
  const { feed, canAct, command, pending } = useStudio();
  const all = onlyActive ? feed.jobs.filter((j) => j.status === 'printing' || j.status === 'queued' || j.status === 'failed') : feed.jobs;
  const jobs = limit ? all.slice(0, limit) : all;
  const active = feed.jobs.filter((j) => j.status === 'printing' || j.status === 'queued' || j.status === 'failed');
  return (
    <Card flush title={`คิวพิมพ์${active.length ? ` • ต้องดู ${active.length}` : ''}`} subtitle="สถานะจากคิวเครื่องพิมพ์ของตู้ • พิมพ์ซ้ำใช้ไฟล์ในตู้ (เก็บ 2 วัน)" icon={<Printer aria-hidden />}>
      {jobs.length ? (
        <div className="max-h-[36rem] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface text-left text-xs text-ink-500">
              <tr>
                <th className="px-4 py-2 font-medium">เวลา</th>
                <th className="px-2 py-2 font-medium">คิว</th>
                <th className="px-2 py-2 font-medium">ตู้</th>
                <th className="px-2 py-2 font-medium">สถานะ</th>
                <th className="px-4 py-2 text-right font-medium">{canAct ? 'สั่งงาน' : ''}</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => {
                const st = JOB_STATUS[j.status] ?? { label: j.status, tone: 'neutral' as Tone };
                const needs = j.status === 'failed' || j.status === 'printing' || j.status === 'queued';
                return (
                  <tr key={j.id} className={clsx('border-t border-ink-100 align-top', j.status === 'failed' && 'bg-danger-50/60')}>
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
        <p className="px-5 py-6 text-ink-500">{onlyActive ? 'ไม่มีงานที่ต้องดู ทุกอย่างพิมพ์เรียบร้อย' : 'ยังไม่มีงานพิมพ์วันนี้'}</p>
      )}
      {!onlyActive && feed.commands.length ? (
        <div className="border-t border-ink-100 px-4 py-3">
          <p className="mb-2 text-xs font-medium text-ink-500">คำสั่งล่าสุด</p>
          <ul className="flex flex-col gap-1 text-sm">
            {feed.commands.slice(0, 8).map((c) => {
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
  );
}

/** Today's photos; tap one to view it and reprint / cancel. */
export function PhotoWall({ limit, large = false }: { limit?: number; large?: boolean }) {
  const { feed, orgSlug, canAct, canOrders, command, pending } = useStudio();
  const [photo, setPhoto] = useState<string | null>(null);
  const photos = limit ? feed.photos.slice(0, limit) : feed.photos;
  const current = feed.photos.find((p) => p.orderId === photo);
  return (
    <Card title="ภาพลูกค้า" subtitle={`${feed.photos.length} ภาพล่าสุดของวันนี้ • แตะเพื่อดูและสั่งงาน`} icon={<Images aria-hidden />}>
      {photos.length ? (
        <div className={clsx('grid gap-2', large ? 'grid-cols-3 sm:grid-cols-4 lg:grid-cols-6' : 'grid-cols-3 sm:grid-cols-4 xl:grid-cols-3')}>
          {photos.map((p) => (
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
            <p className="mt-2 text-xs text-ink-500">สถานะ: {ORDER_STATUS[current.status] ?? current.status}</p>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

/** Day totals (owner / manager). */
export function SalesStats() {
  const s = useStudio().feed.summary;
  if (!s) return null;
  return (
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
  );
}

/** Totals by product, by kiosk and by hour. */
export function SalesBreakdown() {
  const s = useStudio().feed.summary;
  if (!s) return null;
  const maxHour = Math.max(1, ...s.byHour.map((h) => h.orders));
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <Card title="ตามสินค้า" icon={<ReceiptText aria-hidden />}>
        {s.byProduct.length ? (
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
        ) : (
          <p className="text-sm text-ink-500">ยังไม่มีออเดอร์</p>
        )}
      </Card>
      <Card title="ตามตู้" icon={<MonitorSmartphone aria-hidden />}>
        {s.byKiosk.length ? (
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
        ) : (
          <p className="text-sm text-ink-500">ยังไม่มีออเดอร์</p>
        )}
      </Card>
      <Card title="รายชั่วโมง" icon={<Clock aria-hidden />}>
        {s.byHour.length ? (
          <div className="flex h-32 items-end gap-1" role="img" aria-label="จำนวนออเดอร์รายชั่วโมง">
            {s.byHour.map((h) => (
              <div key={h.hour} className="flex flex-1 flex-col items-center gap-1" title={`${h.hour}:00 • ${h.orders} ออเดอร์`}>
                <span className="text-[10px] text-ink-600 tabular-nums">{h.orders}</span>
                <div className="w-full rounded-t bg-primary-500" style={{ height: `${Math.max(4, (h.orders / maxHour) * 88)}px` }} />
                <span className="text-[10px] text-ink-500 tabular-nums">{h.hour}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-ink-500">ยังไม่มีออเดอร์</p>
        )}
      </Card>
    </div>
  );
}

/** Today's orders of the event (latest first). */
export function OrdersToday() {
  const { feed, orgSlug, canOrders } = useStudio();
  return (
    <Card flush title="ออเดอร์วันนี้" subtitle="ล่าสุดก่อน • ยอดและการชำระเงินดูได้ในรายละเอียดออเดอร์" icon={<ReceiptText aria-hidden />}>
      {feed.photos.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-ink-500">
              <tr>
                <th className="px-4 py-2 font-medium">เวลา</th>
                <th className="px-2 py-2 font-medium">คิว</th>
                <th className="px-2 py-2 font-medium">สินค้า</th>
                <th className="px-2 py-2 font-medium">ตู้</th>
                <th className="px-2 py-2 font-medium">สถานะ</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {feed.photos.map((o) => (
                <tr key={o.orderId} className="border-t border-ink-100">
                  <td className="px-4 py-2 whitespace-nowrap text-ink-600 tabular-nums">{time(o.orderedAt)}</td>
                  <td className="px-2 py-2 font-mono font-semibold text-ink-900">{o.queueNo ?? '—'}</td>
                  <td className="px-2 py-2 text-ink-900">{productLabel(o.product)}</td>
                  <td className="px-2 py-2 text-ink-700">{o.kiosk}</td>
                  <td className="px-2 py-2 text-ink-700">{ORDER_STATUS[o.status] ?? o.status}</td>
                  <td className="px-4 py-2 text-right">
                    {canOrders ? (
                      <Link href={`/o/${orgSlug}/orders/${o.orderId}`} className="text-primary-700 hover:underline">
                        ดู
                      </Link>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-5 py-6 text-ink-500">ยังไม่มีออเดอร์วันนี้</p>
      )}
    </Card>
  );
}
