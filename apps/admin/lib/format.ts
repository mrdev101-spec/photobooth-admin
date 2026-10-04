const TZ = 'Asia/Bangkok';

/** `1 ต.ค. 2569 14:05` (Buddhist year, Thai time). */
export function formatDateTime(d: Date | null | undefined, timeZone = TZ): string {
  if (!d) return '—';
  return new Intl.DateTimeFormat('th-TH', { timeZone, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d);
}

export function formatDate(d: Date | null | undefined, timeZone = TZ): string {
  if (!d) return '—';
  return new Intl.DateTimeFormat('th-TH', { timeZone, day: 'numeric', month: 'short', year: 'numeric' }).format(d);
}

/** `฿1,490` from whole baht. */
export function formatBaht(baht: number): string {
  return `฿${baht.toLocaleString('th-TH')}`;
}

const rtf = new Intl.RelativeTimeFormat('th', { numeric: 'auto' });

/** `2 นาทีที่ผ่านมา` — for last-seen times. */
export function formatRelative(d: Date | null | undefined, now = Date.now()): string {
  if (!d) return '—';
  const sec = Math.round((d.getTime() - now) / 1000);
  const abs = Math.abs(sec);
  if (abs < 45) return 'เมื่อสักครู่';
  if (abs < 3600) return rtf.format(Math.round(sec / 60), 'minute');
  if (abs < 86_400) return rtf.format(Math.round(sec / 3600), 'hour');
  return rtf.format(Math.round(sec / 86_400), 'day');
}

export function formatNumber(n: number): string {
  return n.toLocaleString('th-TH');
}
