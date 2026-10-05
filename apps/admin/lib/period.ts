/** Report period from ?from=YYYY-MM-DD&to=YYYY-MM-DD (Thai days, `to` inclusive); default = this month. */
export function periodFromParams(params: URLSearchParams | Record<string, string | string[] | undefined>, now = new Date()) {
  const get = (k: string) => {
    const v = params instanceof URLSearchParams ? params.get(k) : params[k];
    return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
  };
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(now);
  const fromDay = get('from') ?? `${today.slice(0, 7)}-01`;
  const toDay = get('to') ?? today;
  // Midnight in Bangkok (UTC+7, no DST)
  const from = new Date(`${fromDay}T00:00:00+07:00`);
  const to = new Date(new Date(`${toDay}T00:00:00+07:00`).getTime() + 86_400_000);
  return { from, to, fromDay, toDay, label: `${fromDay}_${toDay}` };
}
