import clsx from 'clsx';
import { formatNumber } from '@/lib/format';
import { Badge } from '@/components/ui';
import { aiUsageLevel } from '@/lib/ai-quota';

export { aiUsageLevel };

export function AiUsageBadge({ used, quota }: { used: number; quota: number | null }) {
  const level = aiUsageLevel(used, quota);
  if (level === 'full') return <Badge tone="danger" dot>ครบโควตา</Badge>;
  if (level === 'warn') return <Badge tone="warning" dot>ใกล้ครบ</Badge>;
  return null;
}

/** "used / quota" with a bar (no bar when unlimited). */
export function AiUsageBar({ used, quota, className }: { used: number; quota: number | null; className?: string }) {
  const level = aiUsageLevel(used, quota);
  const pct = quota ? Math.min(100, Math.round((used / quota) * 100)) : 0;
  return (
    <div className={clsx('flex min-w-0 flex-col gap-1.5', className)}>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-semibold tabular-nums text-ink-900">
          {formatNumber(used)} {quota == null ? 'ภาพ' : `/ ${formatNumber(quota)} ภาพ`}
        </span>
        <span className="text-ink-500 tabular-nums">{quota == null ? 'ไม่จำกัด' : `${pct}%`}</span>
      </div>
      {quota != null ? (
        <div className="h-2 overflow-hidden rounded-full bg-ink-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className={clsx('h-full rounded-full', level === 'full' ? 'bg-danger-600' : level === 'warn' ? 'bg-warning-600' : 'bg-primary-500')} style={{ width: `${pct}%` }} />
        </div>
      ) : null}
    </div>
  );
}
