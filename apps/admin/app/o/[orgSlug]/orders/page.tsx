import type { Metadata } from 'next';
import Link from 'next/link';
import { Banknote, Clock, Filter, Printer, ReceiptText } from 'lucide-react';
import { formatPickupCode } from '@photobooth/contracts';
import { requireOrg } from '@/server/auth/context';
import { can } from '@/server/auth/rbac';
import { effectiveStatus, listOrders, salesSummary } from '@/server/services/orders';
import { listKiosks } from '@/server/services/kiosks';
import { AutoRefresh } from '@/components/auto-refresh';
import { RangeFilter } from '@/components/range-filter';
import { Badge, EmptyState, PageHeader, Select, StatCard, Table, Td, Th, buttonClass } from '@/components/ui';
import { resolveRange } from '@/lib/date-range';
import { FLAG_LABELS, PAYMENT_LABELS, productLabel, statusLabel } from '@/lib/order-labels';
import { formatBaht, formatNumber } from '@/lib/format';

export const metadata: Metadata = { title: 'ออเดอร์' };

const STATUS_FILTERS = [
  { id: '', label: 'ทุกสถานะ' },
  { id: 'waiting', label: 'รอรับ / กำลังพิมพ์' },
  { id: 'handed_over', label: 'ส่งมอบแล้ว' },
  { id: 'printed_at_kiosk', label: 'พิมพ์ที่ตู้แล้ว' }
];

export default async function OrdersPage({
  params,
  searchParams
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ range?: string; from?: string; to?: string; kiosk?: string; status?: string; fulfillment?: string }>;
}) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const ctx = await requireOrg(orgSlug, 'order.view');
  const range = resolveRange(sp.range, sp.from, sp.to);
  const status = STATUS_FILTERS.some((s) => s.id === sp.status) ? sp.status : '';
  const fulfillment = sp.fulfillment === 'kiosk' || sp.fulfillment === 'pickup' ? sp.fulfillment : undefined;
  const canReport = can(ctx.principal, 'report.view');

  const [rows, kiosks, summary] = await Promise.all([
    listOrders(ctx, { from: range.from, to: range.to, kioskRowId: sp.kiosk || undefined, status: (status || undefined) as never, fulfillment, limit: 500 }),
    listKiosks(ctx, { includeRevoked: true }),
    canReport ? salesSummary(ctx, range.from, range.to) : Promise.resolve(null)
  ]);
  const base = `/o/${ctx.org.slug}/orders`;
  const keep = { range: sp.range, from: sp.from, to: sp.to, kiosk: sp.kiosk, status: status || undefined, fulfillment };
  const waiting = summary ? (summary.byStatus.uploaded ?? 0) + (summary.byStatus.claimed ?? 0) : 0;

  return (
    <>
      {range.preset === 'today' ? <AutoRefresh seconds={20} /> : null}
      <PageHeader
        title="ออเดอร์"
        description="ทุกการขายจากทุกตู้ ทั้งพิมพ์ที่ตู้และรับที่จุดรับรูป"
        actions={
          can(ctx.principal, 'pickup.use') ? (
            <Link href={`/o/${ctx.org.slug}/pickup`} className={buttonClass()}>
              <Clock className="size-5" aria-hidden />
              เปิดจุดรับรูป
            </Link>
          ) : null
        }
      />

      <div className="mb-4">
        <RangeFilter base={base} preset={range.preset} from={range.from} to={range.to} extra={{ kiosk: keep.kiosk, status: keep.status, fulfillment: keep.fulfillment }} />
      </div>

      {summary ? (
        <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard tone="primary" label="ยอดขาย (เงินจริง)" value={formatBaht(summary.total.liveSatang / 100)} icon={<Banknote aria-hidden />} hint={summary.total.otherSatang ? `ทดสอบ/จำลอง ${formatBaht(summary.total.otherSatang / 100)}` : undefined} href={`/o/${ctx.org.slug}/sales?${new URLSearchParams(Object.entries({ range: sp.range, from: sp.from, to: sp.to }).filter((e): e is [string, string] => !!e[1])).toString()}`} />
          <StatCard label="ออเดอร์" value={formatNumber(summary.total.orders)} icon={<ReceiptText aria-hidden />} />
          <StatCard tone={waiting ? 'danger' : 'default'} label="รอรับที่จุดรับรูป" value={formatNumber(waiting)} icon={<Clock aria-hidden />} href={`${base}?status=waiting`} />
          <StatCard label="พิมพ์ที่ตู้แล้ว / ส่งมอบแล้ว" value={`${formatNumber(summary.byStatus.printed_at_kiosk ?? 0)} / ${formatNumber(summary.byStatus.handed_over ?? 0)}`} icon={<Printer aria-hidden />} />
        </div>
      ) : null}

      <form action={base} className="mb-4 flex flex-wrap items-center gap-2">
        {['range', 'from', 'to'].map((k) => (keep[k as keyof typeof keep] ? <input key={k} type="hidden" name={k} value={keep[k as keyof typeof keep]} /> : null))}
        <Select name="kiosk" defaultValue={sp.kiosk ?? ''} wrapperClassName="w-52" className="h-10" aria-label="ตู้">
          <option value="">ทุกตู้</option>
          {kiosks.map(({ kiosk: k }) => (
            <option key={k.id} value={k.id}>
              {k.name}
            </option>
          ))}
        </Select>
        <Select name="status" defaultValue={status} wrapperClassName="w-52" className="h-10" aria-label="สถานะ">
          {STATUS_FILTERS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </Select>
        <Select name="fulfillment" defaultValue={fulfillment ?? ''} wrapperClassName="w-48" className="h-10" aria-label="การรับภาพ">
          <option value="">ทุกการรับภาพ</option>
          <option value="pickup">จุดรับรูป</option>
          <option value="kiosk">พิมพ์ที่ตู้</option>
        </Select>
        <button type="submit" className={buttonClass('outline', 'sm', 'h-10')}>
          <Filter className="size-4" aria-hidden />
          กรอง
        </button>
      </form>

      {rows.length ? (
        <Table>
          <thead>
            <tr>
              <Th>เวลา</Th>
              <Th>ภาพ</Th>
              <Th>รายการ</Th>
              <Th>ตู้</Th>
              <Th>การรับภาพ</Th>
              <Th>สถานะ</Th>
              <Th className="text-right">ยอด</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => {
              const st = statusLabel(effectiveStatus(o), o.fulfillment);
              const pay = PAYMENT_LABELS[o.paymentKind]!;
              const thumb = o.files.find((f) => f.kind === 'photo' || f.kind === 'ai' || f.kind === 'badge');
              return (
                <tr key={o.id} className="hover:bg-ink-50">
                  <Td className="whitespace-nowrap text-ink-600">
                    {o.orderedAt.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </Td>
                  <Td>
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb.url} alt="" loading="lazy" className="h-12 w-8 rounded border border-ink-200 bg-ink-50 object-cover" />
                    ) : (
                      <span className="block h-12 w-8 rounded border border-ink-200 bg-ink-100" />
                    )}
                  </Td>
                  <Td>
                    <Link href={`${base}/${o.id}`} className="font-semibold text-ink-900 hover:underline">
                      {productLabel(o.product, o.mode)}
                    </Link>
                    {o.code ? <div className="font-mono text-sm text-ink-500">{formatPickupCode(o.code)}</div> : null}
                  </Td>
                  <Td className="text-ink-700">{o.kioskName}</Td>
                  <Td className="text-ink-700">{o.fulfillment === 'pickup' ? 'จุดรับรูป' : 'พิมพ์ที่ตู้'}</Td>
                  <Td>
                    <Badge tone={st.tone} dot>
                      {st.label}
                    </Badge>
                  </Td>
                  <Td className="text-right whitespace-nowrap">
                    <span className="font-semibold text-ink-900">{formatBaht(o.amountSatang / 100)}</span>
                    {o.paymentKind !== 'live' ? (
                      <div>
                        <Badge tone={pay.tone}>{pay.label}</Badge>
                        {o.flags?.map((f) => (
                          <span key={f} title={FLAG_LABELS[f] ?? f}>
                            <Badge tone="danger">ตรวจสอบ</Badge>
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      ) : (
        <EmptyState title="ไม่มีออเดอร์ในช่วงนี้" icon={<ReceiptText aria-hidden />}>
          ออเดอร์จะเข้ามาอัตโนมัติเมื่อลูกค้าซื้อที่ตู้
        </EmptyState>
      )}
    </>
  );
}
