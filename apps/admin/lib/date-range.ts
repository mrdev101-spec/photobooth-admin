/** Report ranges in Thai time (UTC+7, no DST). Dates in URLs are YYYY-MM-DD (Thai calendar day). */

const OFFSET = 7 * 3600_000;

export type RangePreset = 'today' | 'yesterday' | '7d' | '30d' | 'month' | 'custom';

/** UTC instant of 00:00 Thai time on a YYYY-MM-DD day. */
export function thaiDayStart(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  return new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!) - OFFSET);
}

/** YYYY-MM-DD of an instant in Thai time. */
export function thaiYmd(d: Date): string {
  return new Date(d.getTime() + OFFSET).toISOString().slice(0, 10);
}

const DAY = 86_400_000;

/** [from, to) for a preset or custom from/to days (inclusive of `to`). */
export function resolveRange(preset: string | undefined, fromYmd?: string, toYmd?: string, now = new Date()): { from: Date; to: Date; preset: RangePreset } {
  const today = thaiDayStart(thaiYmd(now))!;
  switch (preset) {
    case 'yesterday':
      return { from: new Date(today.getTime() - DAY), to: today, preset };
    case '7d':
      return { from: new Date(today.getTime() - 6 * DAY), to: new Date(today.getTime() + DAY), preset };
    case '30d':
      return { from: new Date(today.getTime() - 29 * DAY), to: new Date(today.getTime() + DAY), preset };
    case 'month': {
      const ymd = thaiYmd(now);
      return { from: thaiDayStart(`${ymd.slice(0, 8)}01`)!, to: new Date(today.getTime() + DAY), preset };
    }
    case 'custom': {
      const from = fromYmd ? thaiDayStart(fromYmd) : null;
      const to = toYmd ? thaiDayStart(toYmd) : null;
      if (from && to && to >= from && to.getTime() - from.getTime() <= 366 * DAY) return { from, to: new Date(to.getTime() + DAY), preset };
      break;
    }
  }
  return { from: today, to: new Date(today.getTime() + DAY), preset: 'today' };
}

export const RANGE_LABELS: Record<Exclude<RangePreset, 'custom'>, string> = { today: 'วันนี้', yesterday: 'เมื่อวาน', '7d': '7 วัน', '30d': '30 วัน', month: 'เดือนนี้' };
