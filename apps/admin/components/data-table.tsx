'use client';

import { useMemo, useState, type ReactNode } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input, Table, Td, Th, buttonClass } from './ui';

/** Per-column options read by DataTable (set as `meta` on a column). */
export type DataColumnMeta = { align?: 'left' | 'right'; headerClassName?: string; cellClassName?: string };

/**
 * Table with sorting (click a header), an optional search box and paging, built on TanStack
 * Table and the admin Table / Th / Td. The rows come from the server already filtered by the
 * page's own filters (date range, kiosk, status...); this adds the in-page tools.
 */
export function DataTable<T>({
  columns,
  data,
  searchText,
  searchPlaceholder = 'ค้นหา…',
  pageSize = 25,
  initialSort = [],
  bare,
  empty,
  rowClassName
}: {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  /** Text a row is searched by; omit to hide the search box. */
  searchText?: (row: T) => string;
  searchPlaceholder?: string;
  pageSize?: number;
  initialSort?: SortingState;
  /** Inside a flush Card: the card draws the border. */
  bare?: boolean;
  empty?: ReactNode;
  rowClassName?: string;
}) {
  const [sorting, setSorting] = useState<SortingState>(initialSort);
  const [query, setQuery] = useState('');
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize });

  const index = useMemo(() => (searchText ? new Map(data.map((r) => [r, searchText(r).toLowerCase()])) : null), [data, searchText]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter: query, pagination },
    onSortingChange: setSorting,
    onGlobalFilterChange: setQuery,
    onPaginationChange: setPagination,
    globalFilterFn: (row, _id, value: string) => {
      const q = String(value ?? '').trim().toLowerCase();
      if (!q || !index) return true;
      return (index.get(row.original) ?? '').includes(q);
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel()
  });

  const total = table.getFilteredRowModel().rows.length;
  const { pageIndex } = table.getState().pagination;
  const first = total ? pageIndex * pagination.pageSize + 1 : 0;
  const last = Math.min(total, (pageIndex + 1) * pagination.pageSize);
  const paged = data.length > pagination.pageSize;

  return (
    <div className="flex flex-col gap-3">
      {searchText ? (
        <div className="max-w-sm">
          <Input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              table.setPageIndex(0);
            }}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            leading={<Search className="size-4" aria-hidden />}
            className="h-10"
          />
        </div>
      ) : null}

      <Table bare={bare}>
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((h) => {
                const meta = (h.column.columnDef.meta ?? {}) as DataColumnMeta;
                const sorted = h.column.getIsSorted();
                const canSort = h.column.getCanSort();
                const label = h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext());
                return (
                  <Th key={h.id} className={cn(meta.align === 'right' && 'text-right', meta.headerClassName)}>
                    {canSort ? (
                      <button
                        type="button"
                        onClick={h.column.getToggleSortingHandler()}
                        aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'}
                        className={cn('-mx-1 inline-flex items-center gap-1 rounded px-1 hover:text-ink-900', meta.align === 'right' && 'flex-row-reverse', sorted && 'text-primary-700')}
                      >
                        {label}
                        {sorted === 'asc' ? <ArrowUp className="size-3.5" aria-hidden /> : sorted === 'desc' ? <ArrowDown className="size-3.5" aria-hidden /> : <ArrowUpDown className="size-3.5 opacity-40" aria-hidden />}
                      </button>
                    ) : (
                      label
                    )}
                  </Th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row) => (
              <tr key={row.id} className={cn('hover:bg-ink-50', rowClassName)}>
                {row.getVisibleCells().map((cell) => {
                  const meta = (cell.column.columnDef.meta ?? {}) as DataColumnMeta;
                  return (
                    <Td key={cell.id} className={cn(meta.align === 'right' && 'text-right', meta.cellClassName)}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </Td>
                  );
                })}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length} className="border-b border-ink-100 px-4 py-8 text-center text-ink-500">
                {empty ?? 'ไม่พบรายการที่ค้นหา'}
              </td>
            </tr>
          )}
        </tbody>
      </Table>

      {paged || query ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-ink-600">
          <span>
            {total ? `แสดง ${first}–${last} จาก ${total} รายการ` : 'ไม่พบรายการ'}
            {query && total !== data.length ? ` (ทั้งหมด ${data.length})` : ''}
          </span>
          {paged ? (
            <div className="flex items-center gap-2">
              <button type="button" className={buttonClass('outline', 'sm')} onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
                <ChevronLeft className="size-4" aria-hidden />
                ก่อนหน้า
              </button>
              <span className="tabular-nums">
                หน้า {pageIndex + 1} / {Math.max(1, table.getPageCount())}
              </span>
              <button type="button" className={buttonClass('outline', 'sm')} onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
                ถัดไป
                <ChevronRight className="size-4" aria-hidden />
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
