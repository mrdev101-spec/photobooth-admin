/** 80 % = warn the shop and the platform; 100 % = AI mode closes on the kiosks until next month. */
export const AI_WARN_AT = 0.8;

export function aiUsageLevel(used: number, quota: number | null): 'ok' | 'warn' | 'full' {
  if (quota == null) return 'ok';
  if (used >= quota) return 'full';
  return used >= quota * AI_WARN_AT ? 'warn' : 'ok';
}

/** The quota period: calendar month in Thailand, e.g. "2026-10". */
export function currentMonth(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit' }).format(now).slice(0, 7);
}
