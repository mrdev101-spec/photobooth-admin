'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Building2, Check, ChevronDown, KeyRound, LogOut, ShieldCheck } from 'lucide-react';
import { Badge } from './ui';

export interface MenuOrg {
  slug: string;
  name: string;
}

export function Avatar({ name, dark }: { name: string; dark?: boolean }) {
  return (
    <span className={dark ? 'flex size-9 items-center justify-center rounded-full bg-ink-900 font-semibold text-white' : 'flex size-9 items-center justify-center rounded-full bg-ink-600 font-semibold text-white'} aria-hidden>
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

/** Account dropdown in the header: who you are, switch customer / Platform Console, change password, sign out. */
export function UserMenu({
  name,
  email,
  roleLabel,
  orgs,
  currentSlug,
  showPlatformLink,
  logout
}: {
  name: string;
  email: string;
  roleLabel: string;
  orgs: MenuOrg[];
  currentSlug?: string;
  showPlatformLink: boolean;
  logout: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const item = 'flex w-full items-center gap-2.5 px-4 py-2 text-left hover:bg-ink-50';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`บัญชีผู้ใช้ ${name}`}
        className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-ink-100"
      >
        <Avatar name={name} dark={showPlatformLink} />
        <span className="hidden text-left leading-tight sm:block">
          <span className="block max-w-[12rem] truncate font-medium text-ink-900">{name}</span>
          <span className="block text-xs text-ink-500">{roleLabel}</span>
        </span>
        <ChevronDown className="size-4 text-ink-500" aria-hidden />
      </button>

      {open ? (
        <div role="menu" className="absolute right-0 z-50 mt-2 w-80 rounded-card border border-ink-200 bg-surface py-2 shadow-lg">
          <div className="border-b border-ink-100 px-4 pb-3">
            <p className="font-semibold text-ink-900">{name}</p>
            <p className="truncate text-sm text-ink-500">{email}</p>
            <Badge tone="primary" className="mt-2" icon={<ShieldCheck className="size-3.5" aria-hidden />}>
              {roleLabel}
            </Badge>
          </div>

          {showPlatformLink || orgs.length > 1 || (orgs.length === 1 && !currentSlug) ? (
            <div className="border-b border-ink-100 py-2">
              {showPlatformLink ? (
                <Link role="menuitem" href="/platform" className={item} onClick={() => setOpen(false)}>
                  <ShieldCheck className="size-4 text-ink-500" aria-hidden />
                  <span className="flex-1">Platform Console</span>
                  {!currentSlug ? <Check className="size-4 text-primary-600" aria-hidden /> : null}
                </Link>
              ) : null}
              {orgs.length ? <p className="px-4 pt-2 pb-1 text-xs font-semibold text-ink-500 uppercase">บัญชีลูกค้า</p> : null}
              <div className="max-h-64 overflow-y-auto">
                {orgs.map((o) => (
                  <Link key={o.slug} role="menuitem" href={`/o/${o.slug}/dashboard`} className={item} onClick={() => setOpen(false)}>
                    <Building2 className="size-4 text-ink-500" aria-hidden />
                    <span className="flex-1 truncate">{o.name}</span>
                    {o.slug === currentSlug ? <Check className="size-4 text-primary-600" aria-hidden /> : null}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}

          <div className="pt-2">
            <Link role="menuitem" href="/change-password" className={item} onClick={() => setOpen(false)}>
              <KeyRound className="size-4 text-ink-500" aria-hidden />
              เปลี่ยนรหัสผ่าน
            </Link>
            <form action={logout}>
              <button type="submit" role="menuitem" className={`${item} text-danger-600`}>
                <LogOut className="size-4" aria-hidden />
                ออกจากระบบ
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
