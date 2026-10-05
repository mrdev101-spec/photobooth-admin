'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import clsx from 'clsx';
import { ArrowLeftRight, Banknote, Images, LayoutTemplate, LogOut, MonitorSmartphone, PackageCheck, Printer, Radio, Settings2, X } from 'lucide-react';
import type { ConsoleFeed } from '@/server/services/event-console';
import { orderCommandAction } from '@/app/o/[orgSlug]/(admin)/orders/actions';

/**
 * Event Studio: the shop's on-site mode for one งาน (or every kiosk). Its own layout and accent,
 * one live feed (polled every 3 s) shared by every page of the event.
 */

const POLL_MS = 3000;

export interface StudioPerms {
  canAct: boolean;
  canOrders: boolean;
  canQuick: boolean;
  canSales: boolean;
  canPickup: boolean;
  canTemplates: boolean;
}

interface StudioCtx extends StudioPerms {
  orgSlug: string;
  eventKey: string;
  eventId: string | null;
  feed: ConsoleFeed;
  stale: boolean;
  age: number;
  load: () => Promise<void>;
  command: (orderId: string, type: 'reprint' | 'cancel_print') => void;
  pending: boolean;
  notify: (m: { ok: boolean; text: string }) => void;
}

const Ctx = createContext<StudioCtx | null>(null);

export function useStudio(): StudioCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useStudio outside Event Studio');
  return c;
}

export function StudioShell({
  orgSlug,
  orgName,
  eventKey,
  eventId,
  eventName,
  userName,
  exitHref,
  initial,
  perms,
  children
}: {
  orgSlug: string;
  orgName: string;
  eventKey: string;
  eventId: string | null;
  eventName: string;
  userName: string;
  exitHref: string;
  initial: ConsoleFeed;
  perms: StudioPerms;
  children: ReactNode;
}) {
  const [feed, setFeed] = useState(initial);
  const [stale, setStale] = useState(false);
  const [, tick] = useState(0);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const pathname = usePathname();
  const base = `/o/${orgSlug}/studio/${eventKey}`;
  const busy = useRef(false);

  const load = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const res = await fetch(`/o/${orgSlug}/console/feed${eventId ? `?event=${encodeURIComponent(eventId)}` : ''}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      setFeed(await res.json());
      setStale(false);
    } catch {
      setStale(true);
    } finally {
      busy.current = false;
    }
  }, [orgSlug, eventId]);

  useEffect(() => {
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
      tick((n) => n + 1);
    }, POLL_MS);
    return () => window.clearInterval(t);
  }, [load]);

  // Remember the event: the next "Event Console" click opens it straight away
  useEffect(() => {
    document.cookie = `pb_studio_${orgSlug}=${eventKey}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
  }, [orgSlug, eventKey]);

  const command = (orderId: string, type: 'reprint' | 'cancel_print') =>
    start(async () => {
      const r = await orderCommandAction(orgSlug, orderId, type, { ok: true });
      setMsg({ ok: !!r.ok, text: r.message ?? (r.ok ? 'ส่งคำสั่งแล้ว' : 'ส่งคำสั่งไม่สำเร็จ') });
      void load();
    });

  const age = Math.max(0, Math.round((Date.now() - Date.parse(feed.at)) / 1000));
  const online = feed.kiosks.filter((k) => k.connection === 'online').length;
  const problems = feed.kiosks.filter((k) => k.connection === 'offline' || k.printers.some((p) => !p.ok)).length;
  const queue = feed.jobs.filter((j) => j.status === 'queued' || j.status === 'printing').length;
  const failed = feed.jobs.filter((j) => j.status === 'failed').length;

  const nav = [
    { href: base, label: 'ภาพรวมสด', icon: Radio, exact: true },
    { href: `${base}/kiosks`, label: 'ตู้', icon: MonitorSmartphone, badge: `${online}/${feed.kiosks.length}`, alert: problems > 0 },
    { href: `${base}/queue`, label: 'คิวพิมพ์', icon: Printer, badge: failed ? `${failed} ล้มเหลว` : queue ? String(queue) : undefined, alert: failed > 0 },
    { href: `${base}/photos`, label: 'ภาพลูกค้า', icon: Images, badge: feed.photos.length ? String(feed.photos.length) : undefined },
    perms.canSales && { href: `${base}/sales`, label: 'ยอดขายและออเดอร์', icon: Banknote },
    perms.canPickup && { href: `${base}/pickup`, label: 'จุดรับรูป', icon: PackageCheck },
    perms.canQuick && { href: `${base}/settings`, label: 'ตั้งค่างาน', icon: Settings2 },
    perms.canTemplates && { href: `${base}/templates`, label: 'Template ของงาน', icon: LayoutTemplate }
  ].filter((x): x is Exclude<typeof x, false> => !!x);
  const isActive = (href: string, exact?: boolean) => (exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));

  const live = (
    <span className="flex items-center gap-2 text-xs text-ink-500">
      <span className={clsx('inline-block size-2 rounded-full', stale ? 'bg-danger-600' : 'animate-pulse bg-success-600')} aria-hidden />
      {stale ? 'เชื่อมต่อไม่ได้ กำลังลองใหม่…' : `อัปเดต${age < 2 ? 'เมื่อสักครู่' : ` ${age} วินาทีที่แล้ว`}`}
    </span>
  );

  return (
    <Ctx.Provider value={{ ...perms, orgSlug, eventKey, eventId, feed, stale, age, load, command, pending, notify: setMsg }}>
      <div className="flex min-h-dvh flex-col lg:flex-row">
        {/* Event sidebar */}
        <aside className="flex shrink-0 flex-col border-b border-primary-100 bg-surface lg:sticky lg:top-0 lg:h-dvh lg:w-72 lg:border-r lg:border-b-0">
          <div className="flex items-center gap-3 border-b border-primary-100 bg-gradient-to-br from-primary-600 to-primary-800 px-5 py-4 text-white">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
              <Radio className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold tracking-[0.12em] text-white/70 uppercase">Event Studio</p>
              <p className="truncate text-base leading-tight font-semibold" title={eventName}>
                {eventName}
              </p>
              <p className="truncate text-xs text-white/70">{orgName}</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 border-b border-primary-100 px-4 py-3 text-center">
            <div>
              <p className="text-lg font-semibold text-ink-900 tabular-nums">
                {online}/{feed.kiosks.length}
              </p>
              <p className="text-[11px] text-ink-500">ตู้ออนไลน์</p>
            </div>
            <div>
              <p className={clsx('text-lg font-semibold tabular-nums', failed ? 'text-danger-600' : 'text-ink-900')}>{queue + failed}</p>
              <p className="text-[11px] text-ink-500">คิวต้องดู</p>
            </div>
            <div>
              <p className="text-lg font-semibold text-ink-900 tabular-nums">{feed.summary ? feed.summary.orders : feed.photos.length}</p>
              <p className="text-[11px] text-ink-500">ออเดอร์วันนี้</p>
            </div>
          </div>
          <nav aria-label="เมนูหน้างาน" className="flex gap-1 overflow-x-auto px-3 py-2 lg:flex-1 lg:flex-col lg:overflow-y-auto lg:py-3">
            {nav.map((n) => {
              const on = isActive(n.href, n.exact);
              const Icon = n.icon;
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={on ? 'page' : undefined}
                  className={clsx(
                    'flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors',
                    on ? 'bg-primary-600 text-white shadow-sm' : 'text-ink-700 hover:bg-primary-50 hover:text-primary-800'
                  )}
                >
                  <Icon className="size-[18px] shrink-0" aria-hidden />
                  <span className="flex-1">{n.label}</span>
                  {'badge' in n && n.badge ? (
                    <span className={clsx('rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums', on ? 'bg-white/20 text-white' : 'alert' in n && n.alert ? 'bg-danger-50 text-danger-700' : 'bg-primary-50 text-primary-700')}>{n.badge}</span>
                  ) : null}
                </Link>
              );
            })}
          </nav>
          <div className="hidden border-t border-primary-100 px-5 py-3 text-xs text-ink-500 lg:block">{userName}</div>
        </aside>

        {/* Page */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-ink-200 bg-surface/95 px-4 backdrop-blur lg:px-6">
            <div className="min-w-0 flex-1">{live}</div>
            <Link href={`/o/${orgSlug}/studio?pick=1`} className="inline-flex h-9 items-center gap-2 rounded-lg border border-ink-200 px-3 text-sm font-medium text-ink-700 hover:bg-ink-50">
              <ArrowLeftRight className="size-4" aria-hidden />
              <span className="hidden sm:inline">สลับงาน</span>
            </Link>
            <Link href={exitHref} className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-ink-600 hover:bg-ink-50">
              <LogOut className="size-4" aria-hidden />
              <span className="hidden sm:inline">ออกจากหน้างาน</span>
            </Link>
          </header>
          {msg ? (
            <div role="status" className={clsx('flex items-center justify-between gap-3 px-4 py-2 text-sm font-medium lg:px-6', msg.ok ? 'bg-success-50 text-success-700' : 'bg-danger-50 text-danger-700')}>
              {msg.text}
              <button type="button" onClick={() => setMsg(null)} aria-label="ปิด">
                <X className="size-4" aria-hidden />
              </button>
            </div>
          ) : null}
          <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 pt-5 pb-10 lg:px-6">{children}</main>
        </div>
      </div>
    </Ctx.Provider>
  );
}

/** Page title inside the studio. */
export function StudioTitle({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold text-ink-900">{title}</h1>
        {description ? <p className="mt-1 text-sm text-ink-500">{description}</p> : null}
      </div>
      {actions}
    </div>
  );
}
