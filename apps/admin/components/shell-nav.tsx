'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { Menu, X } from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  exact?: boolean;
}
export interface NavSection {
  title?: string;
  items: NavItem[];
}

function isActive(item: NavItem, pathname: string) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** The most specific menu item for the current page (for the header title). */
export function useCurrentItem(sections: NavSection[]): NavItem | undefined {
  const pathname = usePathname();
  return sections
    .flatMap((s) => s.items)
    .filter((i) => isActive(i, pathname))
    .sort((a, b) => b.href.length - a.href.length)[0];
}

export function NavList({ sections, dark, onNavigate }: { sections: NavSection[]; dark: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const current = useCurrentItem(sections);
  return (
    <nav aria-label="เมนูหลัก" className="flex flex-col gap-5 px-3 py-4">
      {sections.map((s, i) => (
        <div key={s.title ?? i}>
          {s.title ? <p className={clsx('mb-1 px-3 text-xs font-semibold tracking-wide uppercase', dark ? 'text-ink-400' : 'text-ink-500')}>{s.title}</p> : null}
          <ul className="flex flex-col gap-0.5">
            {s.items.map((item) => {
              const active = current?.href === item.href && isActive(item, pathname);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={clsx(
                      'flex items-center gap-3 rounded-lg px-3 py-2 font-medium transition-colors',
                      dark
                        ? active
                          ? 'bg-white text-ink-900'
                          : 'text-ink-200 hover:bg-ink-800 hover:text-white'
                        : active
                          ? 'bg-primary-50 text-primary-700'
                          : 'text-ink-700 hover:bg-ink-100'
                    )}
                  >
                    <span className={clsx('shrink-0 [&>svg]:size-5', active ? 'text-primary-600' : dark ? 'text-ink-400' : 'text-ink-500')}>{item.icon}</span>
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function HeaderTitle({ sections, fallback }: { sections: NavSection[]; fallback: string }) {
  const current = useCurrentItem(sections);
  return <p className="min-w-0 flex-1 truncate text-lg font-semibold text-ink-900">{current?.label ?? fallback}</p>;
}

/** Below the desktop breakpoint the sidebar becomes a drawer behind a menu button. */
export function MobileNavButton({ sections, dark, brand, footer }: { sections: NavSection[]; dark: boolean; brand: ReactNode; footer?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="เปิดเมนู" aria-expanded={open} className="-ml-1 flex size-10 items-center justify-center rounded-lg text-ink-700 hover:bg-ink-100 lg:hidden">
        <Menu className="size-5" aria-hidden />
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="เมนู">
          <div className="absolute inset-0 bg-ink-900/40" onClick={() => setOpen(false)} aria-hidden />
          <aside className={clsx('absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col shadow-xl', dark ? 'bg-ink-900' : 'bg-surface')}>
            <div className={clsx('flex h-16 items-center justify-between border-b px-4', dark ? 'border-ink-800' : 'border-ink-200')}>
              {brand}
              <button type="button" onClick={() => setOpen(false)} aria-label="ปิดเมนู" className={clsx('flex size-10 items-center justify-center rounded-lg', dark ? 'text-ink-200 hover:bg-ink-800' : 'text-ink-700 hover:bg-ink-100')}>
                <X className="size-5" aria-hidden />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <NavList sections={sections} dark={dark} onNavigate={() => setOpen(false)} />
            </div>
            {footer}
          </aside>
        </div>
      ) : null}
    </>
  );
}
