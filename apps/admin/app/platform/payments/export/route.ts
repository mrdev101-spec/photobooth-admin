import { NextResponse, type NextRequest } from 'next/server';
import { requirePlatform } from '@/server/auth/context';
import { fillMissingFees, revenueByOrg } from '@/server/services/payments';
import { periodFromParams } from '@/lib/period';

export const dynamic = 'force-dynamic';

/** CSV of paid totals per customer (company account vs own account) for revenue sharing. */
export async function GET(req: NextRequest) {
  await requirePlatform('platform.view');
  const { from, to, label } = periodFromParams(req.nextUrl.searchParams);
  const mode = req.nextUrl.searchParams.get('mode') === 'test' ? 'test' : 'live';
  await fillMissingFees().catch(() => {});
  const rows = await revenueByOrg(from, to, mode);
  const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [
    ['ร้าน', 'บัญชีที่รับเงิน', 'จำนวนรายการ', 'ยอดรวม (บาท)', 'ค่าธรรมเนียม Stripe (บาท)', 'ยอดสุทธิ (บาท)', 'รายการที่ยังไม่มีค่าธรรมเนียม'].map(cell).join(','),
    ...rows.map((r) =>
      [r.name, r.account === 'platform' ? 'บัญชีกลาง' : 'บัญชีร้าน', Number(r.count), Number(r.gross), (Number(r.feeSatang) / 100).toFixed(2), (Number(r.netSatang) / 100).toFixed(2), Number(r.missingFee)].map(cell).join(',')
    )
  ];
  // BOM so Excel reads Thai correctly
  return new NextResponse(`﻿${lines.join('\r\n')}\r\n`, {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="revenue-${mode}-${label}.csv"` }
  });
}
