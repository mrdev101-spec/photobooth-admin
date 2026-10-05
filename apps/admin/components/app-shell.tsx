import clsx from 'clsx';
import type { ReactNode } from 'react';
import { logoutAction } from '@/app/actions';
import { BrandMark } from './brand-mark';
import { HeaderTitle, MobileNavButton, NavList, type NavSection } from './shell-nav';
import { UserMenu, type MenuOrg } from './user-menu';

export type { NavSection } from './shell-nav';

/**
 * Page frame in the Car Rent Flow layout: sticky sidebar (w-64) + header with the current section
 * and the account menu. `platform` = dark ink-900 sidebar (acting on the whole platform, like
 * carent-flow-admin); `org` = white sidebar (inside one customer, like the car-rent-flow shop app).
 */
export function AppShell({
  variant = 'org',
  nav,
  user,
  roleLabel,
  orgs,
  currentSlug,
  showPlatformLink,
  banner,
  sidebarFooter,
  headerActions,
  extraTitles = [],
  children
}: {
  variant?: 'org' | 'platform';
  nav: NavSection[];
  user: { name: string; email: string };
  roleLabel: string;
  orgs: MenuOrg[];
  currentSlug?: string;
  showPlatformLink: boolean;
  banner?: ReactNode;
  sidebarFooter?: ReactNode;
  /** Shortcuts in the top bar, left of the account menu. */
  headerActions?: ReactNode;
  /** Pages reached from the top bar (not the sidebar), for the header title. */
  extraTitles?: NavSection['items'];
  children: ReactNode;
}) {
  const dark = variant === 'platform';
  const brand = <BrandMark inverse={dark} caption={dark ? 'Platform Console' : 'Admin Portal'} />;
  const footer = sidebarFooter ? <div className={clsx('border-t px-5 py-3 text-xs', dark ? 'border-ink-800 text-ink-400' : 'border-ink-200 text-ink-500')}>{sidebarFooter}</div> : null;

  return (
    <div className="flex min-h-dvh bg-canvas">
      <aside className={clsx('sticky top-0 hidden h-dvh w-64 shrink-0 flex-col lg:flex', dark ? 'bg-ink-900' : 'border-r border-ink-200 bg-surface')}>
        <div className={clsx('flex h-16 items-center border-b px-5', dark ? 'border-ink-800' : 'border-ink-200')}>{brand}</div>
        <div className="flex-1 overflow-y-auto">
          <NavList sections={nav} dark={dark} />
        </div>
        {footer}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-ink-200 bg-surface px-4 lg:px-6">
          <MobileNavButton sections={nav} dark={dark} brand={brand} footer={footer} />
          <HeaderTitle sections={extraTitles.length ? [...nav, { items: extraTitles }] : nav} fallback={dark ? 'Platform Console' : 'Photobooth Admin'} />
          {headerActions}
          <UserMenu name={user.name} email={user.email} roleLabel={roleLabel} orgs={orgs} currentSlug={currentSlug} showPlatformLink={showPlatformLink} logout={logoutAction} />
        </header>
        {banner}
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 pt-5 pb-10 lg:px-6">{children}</main>
      </div>
    </div>
  );
}
