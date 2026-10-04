'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import type { ReactNode } from 'react';

export interface RouteTab {
  href: string;
  label: string;
  icon?: ReactNode;
  /** Match only this exact path (for the first tab, whose path prefixes the others). */
  exact?: boolean;
  count?: string;
  /** Set by the page when the tab is chosen by a query string rather than the path. */
  active?: boolean;
}

/** Underlined page tabs driven by the URL (car-rent-flow Tabs look). */
export function RouteTabs({ tabs, label }: { tabs: RouteTab[]; label: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className="mb-5 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-ink-200">
      {tabs.map((t) => {
        const active = t.active ?? (t.exact ? pathname === t.href : pathname === t.href || pathname.startsWith(`${t.href}/`));
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? 'page' : undefined}
            className={clsx(
              '-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 font-medium whitespace-nowrap',
              active ? 'border-primary-600 text-ink-900' : 'border-transparent text-ink-500 hover:text-ink-900'
            )}
          >
            {t.icon ? <span className={clsx('[&>svg]:size-4', active ? 'text-primary-600' : 'text-ink-400')}>{t.icon}</span> : null}
            {t.label}
            {t.count ? <span className="rounded-full bg-ink-100 px-2 text-xs font-semibold text-ink-600">{t.count}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
