import type { Metadata } from 'next';
import { Banknote, BarChart3, Download, MonitorSmartphone, Package, ReceiptText, TestTube2 } from 'lucide-react';
import { requireOrg } from '@/server/auth/context';
import { salesSummary } from '@/server/services/orders';
import { RangeFilter } from '@/components/range-filter';
import { Card, EmptyState, PageHeader, StatCard, Table, Td, Th, buttonClass } from '@/components/ui';
import { SalesBreakdown } from './sales-tables';
import { resolveRange } from '@/lib/date-range';
import { PRODUCT_LABELS } from '@/lib/order-labels';
import { formatBaht, formatNumber } from '@/lib/format';

export const metadata: Metadata = { title: 'ยอดขาย' };

const dayLabel = (ymd: string) => new Date(`${ymd}T00:00:00Z`).toLocaleDateString('th-TH', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });

export default async function SalesPage({ params, searchParams }: { params: Promise<{ orgSlug: string }>; searchParams: Promise<{ range?: string; from?: string; to?: string }> }) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const ctx = await requireOrg(orgSlug, 'report.view');
  const range = resolveRange(sp.range ?? '7d', sp.from, sp.to);
  const s = await salesSummary(ctx, range.from, range.to);
  const base = `/o/${ctx.org.slug}/sales`;
  const csv = `${base}/export?${new URLSearchParams(Object.entries({ range: range.preset, from: sp.from, to: sp.to }).filter((e): e is [string, string] => !!e[1])).toString()}`;
  const maxDay = Math.max(1, ...s.byDay.map((d) => d.liveSatang));
  const avg = s.total.liveOrders ? s.total.liveSatang / 100 / s.total.liveOrders : 0;

  return (
    <>
      <PageHeader
        title="ยอดขาย"
        description="นับเฉพาะเงินจริงในยอดขาย ออเดอร์ทดสอบ/จำลองแยกไว้ต่างหาก (เวลาไทย)"
        actions={
          <a href={csv} className={buttonClass('outline')}>
            <Download className="size-5" aria-hidden />
            ส่งออก CSV
          </a>
        }
      />
      <div className="mb-5">
        <RangeFilter base={base} preset={range.preset} from={range.from} to={range.to} />
      </div>

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard tone="primary" label="ยอดขาย (เงินจริง)" value={formatBaht(s.total.liveSatang / 100)} icon={<Banknote aria-hidden />} />
        <StatCard label="ออเดอร์" value={formatNumber(s.total.orders)} icon={<ReceiptText aria-hidden />} />
        <StatCard label="เฉลี่ยต่อออเดอร์ (เงินจริง)" value={formatBaht(Math.round(avg))} icon={<BarChart3 aria-hidden />} />
        <StatCard label="ทดสอบ / จำลอง (ไม่นับ)" value={formatBaht(s.total.otherSatang / 100)} icon={<TestTube2 aria-hidden />} />
      </div>

      {s.total.orders ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card flush title="รายวัน" icon={<BarChart3 aria-hidden />} className="lg:col-span-2">
            <Table bare>
              <thead>
                <tr>
                  <Th>วัน</Th>
                  <Th className="w-1/2">ยอดขาย</Th>
                  <Th className="text-right">ออเดอร์</Th>
                  <Th className="text-right">ยอด (บาท)</Th>
                </tr>
              </thead>
              <tbody>
                {s.byDay.map((d) => (
                  <tr key={d.day}>
                    <Td className="whitespace-nowrap">{dayLabel(d.day)}</Td>
                    <Td>
                      <div className="h-3 rounded-full bg-ink-100" aria-hidden>
                        <div className="h-3 rounded-full bg-primary-600" style={{ width: `${Math.max(2, (d.liveSatang / maxDay) * 100)}%` }} />
                      </div>
                    </Td>
                    <Td className="text-right">{formatNumber(d.orders)}</Td>
                    <Td className="text-right font-semibold">{formatBaht(d.liveSatang / 100)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>

          <Card flush title="ตามตู้" icon={<MonitorSmartphone aria-hidden />}>
            <SalesBreakdown nameHeader="ตู้" rows={s.byKiosk.map((k) => ({ key: k.kioskRowId, name: k.name, orders: k.orders, liveSatang: k.liveSatang }))} />
          </Card>

          <Card flush title="ตามสินค้า" icon={<Package aria-hidden />}>
            <SalesBreakdown nameHeader="สินค้า" rows={s.byProduct.map((p) => ({ key: p.product, name: PRODUCT_LABELS[p.product] ?? p.product, orders: p.orders, liveSatang: p.liveSatang }))} />
          </Card>
        </div>
      ) : (
        <EmptyState title="ยังไม่มียอดขายในช่วงนี้" icon={<BarChart3 aria-hidden />} />
      )}
    </>
  );
}
