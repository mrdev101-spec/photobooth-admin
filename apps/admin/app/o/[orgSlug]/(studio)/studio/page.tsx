import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ArrowRight, CalendarDays, LayoutGrid, LogOut, MonitorSmartphone, Radio, ReceiptText } from 'lucide-react';
import { requireOrg } from '@/server/auth/context';
import { can } from '@/server/auth/rbac';
import { studioEvents } from '@/server/services/event-console';

export const metadata: Metadata = { title: 'เลือกงาน' };

/**
 * Event Studio entry: pick the งาน to run. With one live event (or a remembered one) it opens
 * straight away; ?pick=1 always shows the list ("สลับงาน").
 */
export default async function StudioPickPage({ params, searchParams }: { params: Promise<{ orgSlug: string }>; searchParams: Promise<{ pick?: string }> }) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const ctx = await requireOrg(orgSlug, 'console.view');
  const events = await studioEvents(ctx);
  const real = events.filter((e) => e.key !== 'all');
  const base = `/o/${ctx.org.slug}/studio`;

  if (!sp.pick) {
    const last = (await cookies()).get(`pb_studio_${ctx.org.slug}`)?.value;
    if (last && events.some((e) => e.key === last)) redirect(`${base}/${last}`);
    if (real.length === 1) redirect(`${base}/${real[0]!.key}`);
  }
  const exitHref = can(ctx.principal, 'kiosk.view') ? `/o/${ctx.org.slug}/dashboard` : `/o/${ctx.org.slug}`;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-4 py-8 lg:px-6">
      <header className="mb-8 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary-600 to-primary-800 text-white shadow-sm">
            <Radio className="size-5" aria-hidden />
          </span>
          <div>
            <p className="text-xs font-semibold tracking-[0.12em] text-primary-700 uppercase">Event Studio</p>
            <p className="text-lg font-semibold text-ink-900">{ctx.org.name}</p>
          </div>
        </div>
        {can(ctx.principal, 'kiosk.view') ? (
          <Link href={exitHref} className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-ink-600 hover:bg-ink-100">
            <LogOut className="size-4" aria-hidden />
            กลับไป Admin
          </Link>
        ) : null}
      </header>

      <h1 className="text-2xl font-semibold text-ink-900">เลือกงานที่จะดูแลวันนี้</h1>
      <p className="mt-1 mb-6 text-sm text-ink-500">หน้างานแสดงเฉพาะตู้ของงานที่เลือก • สลับงานได้ตลอดจากแถบด้านบน</p>

      <div className="grid gap-4 sm:grid-cols-2">
        {events.map((e) => {
          const all = e.key === 'all';
          return (
            <Link
              key={e.key}
              href={`${base}/${e.key}`}
              className="group flex flex-col gap-4 rounded-card border border-ink-200 bg-surface p-5 shadow-card transition hover:-translate-y-0.5 hover:border-primary-300 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700">{all ? <LayoutGrid className="size-5" aria-hidden /> : <CalendarDays className="size-5" aria-hidden />}</span>
                  <div className="min-w-0">
                    <p className="truncate text-lg font-semibold text-ink-900">{e.name}</p>
                    <p className="text-xs text-ink-500">{all ? 'ทุกตู้ของร้าน ไม่แยกงาน' : 'งานที่เปิดอยู่'}</p>
                  </div>
                </div>
                <ArrowRight className="size-5 shrink-0 text-ink-300 transition group-hover:translate-x-0.5 group-hover:text-primary-600" aria-hidden />
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2 rounded-lg bg-ink-50 px-3 py-2">
                  <MonitorSmartphone className="size-4 text-ink-500" aria-hidden />
                  <span className="text-ink-900 tabular-nums">
                    {e.online}/{e.kiosks}
                  </span>
                  <span className="text-ink-500">ตู้ออนไลน์</span>
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-ink-50 px-3 py-2">
                  <ReceiptText className="size-4 text-ink-500" aria-hidden />
                  <span className="text-ink-900 tabular-nums">{e.ordersToday}</span>
                  <span className="text-ink-500">ออเดอร์วันนี้</span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
      {!real.length ? <p className="mt-6 text-sm text-ink-500">ยังไม่มีงานที่เปิดอยู่ • สร้างงานได้ที่ Admin › ค่ากลางและงาน แล้วเลือกตู้เข้างาน</p> : null}
    </div>
  );
}
