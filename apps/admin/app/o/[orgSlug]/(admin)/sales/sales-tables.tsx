'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/data-table';
import { formatBaht, formatNumber } from '@/lib/format';

/** One line of a sales breakdown (by kiosk or by product). */
export type SalesLine = { key: string; name: string; orders: number; liveSatang: number };

function columns(nameHeader: string): ColumnDef<SalesLine, unknown>[] {
  return [
    { id: 'name', accessorFn: (r) => r.name, header: nameHeader, meta: { cellClassName: 'font-semibold text-ink-900' } },
    { id: 'orders', accessorFn: (r) => r.orders, header: 'ออเดอร์', cell: ({ row }) => formatNumber(row.original.orders), meta: { align: 'right' } },
    { id: 'live', accessorFn: (r) => r.liveSatang, header: 'ยอด', cell: ({ row }) => formatBaht(row.original.liveSatang / 100), meta: { align: 'right' } }
  ];
}

/** Sales by kiosk / by product, highest sales first, sortable by any column. */
export function SalesBreakdown({ rows, nameHeader }: { rows: SalesLine[]; nameHeader: string }) {
  return <DataTable bare columns={columns(nameHeader)} data={rows} initialSort={[{ id: 'live', desc: true }]} pageSize={50} />;
}
