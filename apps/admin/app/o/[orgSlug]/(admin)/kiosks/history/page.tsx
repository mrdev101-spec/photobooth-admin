import type { Metadata } from 'next';
import Link from 'next/link';
import { requireOrg } from '@/server/auth/context';
import { listArchivedKiosks } from '@/server/services/kiosks';
import { Archive, ChevronLeft } from 'lucide-react';
import { EmptyState, Notice, PageHeader, Table, Td, Th } from '@/components/ui';
import { formatBaht, formatDate, formatDateTime } from '@/lib/format';
import { thaiYmd } from '@/lib/date-range';

export const metadata: Metadata = { title: 'ประวัติตู้ที่ยกเลิก' };

const DAY = 86_400_000;

/** Orders of a retired kiosk over its whole time in use (the orders page shows up to 366 days). */
function ordersHref(orgSlug: string, kioskRowId: string, first: Date | null, last: Date | null) {
  if (!first || !last) return `/o/${orgSlug}/orders?kiosk=${kioskRowId}&range=30d`;
  const from = last.getTime() - first.getTime() > 365 * DAY ? new Date(last.getTime() - 365 * DAY) : first;
  return `/o/${orgSlug}/orders?kiosk=${kioskRowId}&range=custom&from=${thaiYmd(from)}&to=${thaiYmd(last)}`;
}

/**
 * Kiosks retired with "ยกเลิกตู้": nothing is deleted — each keeps its sales, settings and audit
 * log, and can be opened (read-only) or brought back from its own page.
 */
export default async function KioskHistoryPage({ params, searchParams }: { params: Promise<{ orgSlug: string }>; searchParams: Promise<{ archived?: string }> }) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const ctx = await requireOrg(orgSlug, 'kiosk.view');
  const rows = await listArchivedKiosks(ctx);
  const base = `/o/${ctx.org.slug}/kiosks`;
  const justArchived = sp.archived ? rows.find((r) => r.kiosk.id === sp.archived) : null;

  return (
    <>
      <PageHeader
        breadcrumb={
          <Link href={base} className="inline-flex items-center gap-1 hover:text-ink-900">
            <ChevronLeft className="size-4" aria-hidden />
            ตู้ทั้งหมด
          </Link>
        }
        title="ประวัติตู้ที่ยกเลิก"
        description="ตู้ที่เลิกใช้แล้ว เก็บไว้เป็นข้อมูลย้อนหลัง • ยอดขาย ออเดอร์ การตั้งค่า และ Audit log ยังอยู่ครบ • ไม่นับในโควตาตู้ • นำกลับมาใช้ได้จากหน้าของตู้"
      />

      {justArchived ? (
        <Notice tone="ok" title={`ยกเลิกตู้ "${justArchived.kiosk.name}" แล้ว`} className="mb-6">
          ตู้ถูกตัดการเชื่อมต่อ และย้ายมาเก็บในหน้านี้
        </Notice>
      ) : null}

      {rows.length ? (
        <Table>
          <thead>
            <tr>
              <Th>ตู้</Th>
              <Th>สาขา</Th>
              <Th>ช่วงที่ใช้งาน</Th>
              <Th className="text-right">ออเดอร์</Th>
              <Th className="text-right">ยอดขาย</Th>
              <Th>ยกเลิกเมื่อ</Th>
              <Th>เหตุผล</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ kiosk: k, branchName, archivedByName, stats }) => (
              <tr key={k.id} className={`align-top hover:bg-ink-50 ${k.id === sp.archived ? 'bg-amber-50' : ''}`}>
                <Td>
                  <Link href={`${base}/${k.id}`} className="font-semibold text-ink-900 hover:underline">
                    {k.name}
                  </Link>
                  <div className="font-mono text-xs text-ink-500">{k.kioskId ?? k.formerKioskId ?? 'ไม่เคยเชื่อมต่อ'}</div>
                  {k.hostname ? <div className="text-xs text-ink-500">เครื่อง {k.hostname}</div> : null}
                </Td>
                <Td className="text-ink-600">{branchName ?? '—'}</Td>
                <Td className="whitespace-nowrap text-ink-600">
                  {k.pairedAt ? `${formatDate(k.pairedAt)} – ${formatDate(k.lastSeenAt ?? k.archivedAt)}` : 'ไม่เคยใช้งาน'}
                </Td>
                <Td className="text-right tabular-nums">
                  {stats.orders ? (
                    <Link href={ordersHref(ctx.org.slug, k.id, stats.firstAt ? new Date(stats.firstAt) : null, stats.lastAt ? new Date(stats.lastAt) : null)} className="font-medium text-ink-900 underline-offset-2 hover:underline">
                      {stats.orders.toLocaleString('th-TH')}
                    </Link>
                  ) : (
                    <span className="text-ink-500">0</span>
                  )}
                </Td>
                <Td className="text-right tabular-nums text-ink-900">{formatBaht(stats.salesSatang / 100)}</Td>
                <Td className="whitespace-nowrap text-ink-600">
                  {formatDateTime(k.archivedAt)}
                  {archivedByName ? <div className="text-xs text-ink-500">โดย {archivedByName}</div> : null}
                </Td>
                <Td className="max-w-64 text-ink-600">{k.archivedReason ?? '—'}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <EmptyState title="ยังไม่มีตู้ที่ยกเลิก" icon={<Archive aria-hidden />}>
          ตู้ที่เลิกใช้ ให้กด &quot;ยกเลิกตู้&quot; ที่หน้าของตู้นั้น ตู้จะย้ายมาเก็บที่นี่โดยข้อมูลไม่หายไป
        </EmptyState>
      )}
    </>
  );
}
