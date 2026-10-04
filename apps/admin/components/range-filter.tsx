import Link from 'next/link';
import { CalendarRange } from 'lucide-react';
import { RANGE_LABELS, thaiYmd, type RangePreset } from '@/lib/date-range';
import { buttonClass } from './ui';

/**
 * Date-range chips + custom from/to, all in the URL (GET form) so a report can be bookmarked
 * or shared. `extra` keeps the page's other filters when the range changes.
 */
export function RangeFilter({ base, preset, from, to, extra = {} }: { base: string; preset: RangePreset; from: Date; to: Date; extra?: Record<string, string | undefined> }) {
  const qs = (p: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...extra, ...p })) if (v) q.set(k, v);
    return `${base}?${q.toString()}`;
  };
  const lastDay = thaiYmd(new Date(to.getTime() - 1));
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex flex-wrap gap-1 rounded-lg border border-ink-200 bg-surface p-1">
        {(Object.keys(RANGE_LABELS) as (keyof typeof RANGE_LABELS)[]).map((p) => (
          <Link
            key={p}
            href={qs({ range: p })}
            aria-current={preset === p ? 'page' : undefined}
            className={preset === p ? 'rounded-md bg-ink-900 px-3 py-1.5 text-sm font-medium text-white' : 'rounded-md px-3 py-1.5 text-sm font-medium text-ink-600 hover:bg-ink-100 hover:text-ink-900'}
          >
            {RANGE_LABELS[p]}
          </Link>
        ))}
      </div>
      <form action={base} className="flex flex-wrap items-center gap-2">
        {Object.entries(extra).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
        <input type="hidden" name="range" value="custom" />
        <label className="sr-only" htmlFor="from">
          ตั้งแต่
        </label>
        <input id="from" type="date" name="from" defaultValue={thaiYmd(from)} className="h-9 rounded-lg border border-ink-300 bg-surface px-2 text-sm" />
        <span className="text-ink-500">–</span>
        <label className="sr-only" htmlFor="to">
          ถึง
        </label>
        <input id="to" type="date" name="to" defaultValue={lastDay} className="h-9 rounded-lg border border-ink-300 bg-surface px-2 text-sm" />
        <button type="submit" className={buttonClass(preset === 'custom' ? 'primary' : 'outline', 'sm')}>
          <CalendarRange className="size-4" aria-hidden />
          ดูช่วงนี้
        </button>
      </form>
    </div>
  );
}
