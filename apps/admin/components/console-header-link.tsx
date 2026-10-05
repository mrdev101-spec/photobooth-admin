'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { Radio } from 'lucide-react';

/** Event Console in the top bar, next to the account menu (always one click away at a booth). */
export function ConsoleHeaderLink({ href }: { href: string }) {
  const active = usePathname().startsWith(href);
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      title="Event Console"
      className={clsx(
        'inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border px-3 text-sm font-semibold transition-colors',
        active ? 'border-primary-600 bg-primary-600 text-white' : 'border-primary-200 bg-primary-50 text-primary-700 hover:bg-primary-100'
      )}
    >
      <span className="relative flex size-2.5" aria-hidden>
        <span className={clsx('absolute inline-flex size-full animate-ping rounded-full opacity-60', active ? 'bg-white' : 'bg-primary-500')} />
        <span className={clsx('relative inline-flex size-2.5 rounded-full', active ? 'bg-white' : 'bg-primary-600')} />
      </span>
      <Radio className="size-4 sm:hidden" aria-hidden />
      <span className="hidden sm:inline">Event Console</span>
    </Link>
  );
}
