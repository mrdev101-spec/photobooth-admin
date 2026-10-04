import { NextResponse, type NextRequest } from 'next/server';
import { formatPickupCode } from '@photobooth/contracts';
import { getOrgContext } from '@/server/auth/context';
import { can } from '@/server/auth/rbac';
import { effectiveStatus, listOrders } from '@/server/services/orders';
import { resolveRange, thaiYmd } from '@/lib/date-range';
import { productLabel, statusLabel } from '@/lib/order-labels';

export const dynamic = 'force-dynamic';

/** Spreadsheet-safe cell: quote, and neutralise formulas (=, +, -, @) against CSV injection. */
function cell(v: unknown): string {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/** GET — orders of the range as CSV (UTF-8 with BOM so Excel shows Thai correctly). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const ctx = await getOrgContext(orgSlug);
  if (!can(ctx.principal, 'report.view')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const sp = req.nextUrl.searchParams;
  const range = resolveRange(sp.get('range') ?? '7d', sp.get('from') ?? undefined, sp.get('to') ?? undefined);
  const rows = await listOrders(ctx, { from: range.from, to: range.to, limit: 1000 });

  const header = ['วันเวลา', 'รหัสรับรูป', 'ตู้', 'สาขา', 'สินค้า', 'การรับภาพ', 'สถานะ', 'การชำระ', 'ยอด (บาท)', 'orderId'];
  const lines = rows.map((o) =>
    [
      o.orderedAt.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }),
      o.code ? formatPickupCode(o.code) : '',
      o.kioskName,
      o.branchName ?? '',
      productLabel(o.product, o.mode),
      o.fulfillment === 'pickup' ? 'จุดรับรูป' : 'พิมพ์ที่ตู้',
      statusLabel(effectiveStatus(o), o.fulfillment).label,
      o.paymentKind,
      (o.amountSatang / 100).toFixed(2),
      o.id
    ]
      .map(cell)
      .join(',')
  );
  const body = `﻿${[header.map(cell).join(','), ...lines].join('\r\n')}\r\n`;
  const name = `sales-${ctx.org.slug}-${thaiYmd(range.from)}-${thaiYmd(new Date(range.to.getTime() - 1))}.csv`;
  return new NextResponse(body, {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${name}"`, 'cache-control': 'no-store' }
  });
}
