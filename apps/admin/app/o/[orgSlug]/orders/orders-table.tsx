'use client';

import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable, type DataColumnMeta } from '@/components/data-table';
import { Badge, type Tone } from '@/components/ui';
import { formatBaht } from '@/lib/format';

/** One order row as the orders page sends it to the browser (labels worked out on the server). */
export type OrderTableRow = {
  id: string;
  orderedAt: string; // ISO
  timeLabel: string;
  thumbUrl: string | null;
  product: string;
  code: string | null;
  kioskName: string;
  fulfillment: 'kiosk' | 'pickup';
  status: { label: string; tone: Tone };
  amountSatang: number;
  payment: { live: boolean; label: string; tone: Tone };
  flags: { id: string; label: string }[];
};

const meta = (m: DataColumnMeta) => m;

function columns(base: string): ColumnDef<OrderTableRow, unknown>[] {
  return [
    {
      id: 'orderedAt',
      accessorFn: (o) => o.orderedAt,
      header: 'เวลา',
      cell: ({ row }) => row.original.timeLabel,
      meta: meta({ cellClassName: 'whitespace-nowrap text-ink-600' })
    },
    {
      id: 'thumb',
      header: 'ภาพ',
      enableSorting: false,
      cell: ({ row }) =>
        row.original.thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={row.original.thumbUrl} alt="" loading="lazy" className="h-12 w-8 rounded border border-ink-200 bg-ink-50 object-cover" />
        ) : (
          <span className="block h-12 w-8 rounded border border-ink-200 bg-ink-100" />
        )
    },
    {
      id: 'product',
      accessorFn: (o) => o.product,
      header: 'รายการ',
      cell: ({ row }) => (
        <>
          <Link href={`${base}/${row.original.id}`} className="font-semibold text-ink-900 hover:underline">
            {row.original.product}
          </Link>
          {row.original.code ? <div className="font-mono text-sm text-ink-500">{row.original.code}</div> : null}
        </>
      )
    },
    { id: 'kiosk', accessorFn: (o) => o.kioskName, header: 'ตู้', meta: meta({ cellClassName: 'text-ink-700' }) },
    {
      id: 'fulfillment',
      accessorFn: (o) => (o.fulfillment === 'pickup' ? 'จุดรับรูป' : 'พิมพ์ที่ตู้'),
      header: 'การรับภาพ',
      meta: meta({ cellClassName: 'text-ink-700' })
    },
    {
      id: 'status',
      accessorFn: (o) => o.status.label,
      header: 'สถานะ',
      cell: ({ row }) => (
        <Badge tone={row.original.status.tone} dot>
          {row.original.status.label}
        </Badge>
      )
    },
    {
      id: 'amount',
      accessorFn: (o) => o.amountSatang,
      header: 'ยอด',
      meta: meta({ align: 'right', cellClassName: 'whitespace-nowrap' }),
      cell: ({ row }) => {
        const o = row.original;
        return (
          <>
            <span className="font-semibold text-ink-900">{formatBaht(o.amountSatang / 100)}</span>
            {!o.payment.live ? (
              <div>
                <Badge tone={o.payment.tone}>{o.payment.label}</Badge>
                {o.flags.map((f) => (
                  <span key={f.id} title={f.label}>
                    <Badge tone="danger">ตรวจสอบ</Badge>
                  </span>
                ))}
              </div>
            ) : null}
          </>
        );
      }
    }
  ];
}

/** Orders list: newest first, sortable by any column, searchable by pickup code / product / kiosk. */
export function OrdersTable({ rows, base }: { rows: OrderTableRow[]; base: string }) {
  return (
    <DataTable
      columns={columns(base)}
      data={rows}
      initialSort={[{ id: 'orderedAt', desc: true }]}
      searchText={(o) => `${o.code ?? ''} ${(o.code ?? '').replace(/-/g, '')} ${o.product} ${o.kioskName} ${o.status.label}`}
      searchPlaceholder="ค้นหา รหัสรับรูป สินค้า หรือตู้"
      pageSize={25}
    />
  );
}
