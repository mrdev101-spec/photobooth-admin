import type { Metadata } from 'next';
import Link from 'next/link';
import { Building2, ChevronRight, LogOut, ShieldCheck } from 'lucide-react';
import { requireUser } from '@/server/auth/context';
import { organizationsForUser } from '@/server/services/organizations';
import { ORG_ROLE_LABELS } from '@/server/auth/rbac';
import { logoutAction } from '@/app/actions';
import { BrandMark } from '@/components/brand-mark';
import { Badge, EmptyState } from '@/components/ui';

export const metadata: Metadata = { title: 'เลือกบัญชี' };

export default async function SelectOrgPage() {
  const user = await requireUser();
  const orgs = await organizationsForUser(user.id);
  const row = 'flex items-center gap-3 rounded-card border border-ink-200 bg-surface px-4 py-3.5 shadow-card transition-colors hover:border-primary-300';
  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      <BrandMark />
      <h1 className="mt-8 text-[1.75rem] font-bold text-ink-900">เลือกบัญชี</h1>
      <p className="mt-1 text-ink-500">{user.email}</p>
      <div className="mt-6 flex flex-col gap-3">
        {user.platformRole ? (
          <Link href="/platform" className={row}>
            <span className="flex size-10 items-center justify-center rounded-lg bg-ink-900 text-white">
              <ShieldCheck className="size-5" aria-hidden />
            </span>
            <span className="flex-1">
              <span className="block font-semibold text-ink-900">Platform Console</span>
              <span className="block text-sm text-ink-500">ดูแลลูกค้าและตู้ทั้งหมด</span>
            </span>
            <ChevronRight className="size-5 text-ink-400" aria-hidden />
          </Link>
        ) : null}
        {orgs.map((o) => (
          <Link key={o.id} href={`/o/${o.slug}/dashboard`} className={row}>
            <span className="flex size-10 items-center justify-center rounded-lg bg-ink-100 text-ink-700">
              <Building2 className="size-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold text-ink-900">{o.name}</span>
              <span className="mt-0.5 flex gap-2">
                <Badge>{ORG_ROLE_LABELS[o.role]}</Badge>
                {o.status === 'suspended' ? (
                  <Badge tone="danger" dot>
                    ระงับ
                  </Badge>
                ) : null}
              </span>
            </span>
            <ChevronRight className="size-5 text-ink-400" aria-hidden />
          </Link>
        ))}
        {!orgs.length && !user.platformRole ? <EmptyState title="ยังไม่มีบัญชีลูกค้า">ติดต่อผู้ดูแลเพื่อเพิ่มคุณเข้าบัญชี</EmptyState> : null}
      </div>
      <form action={logoutAction} className="mt-8">
        <button type="submit" className="inline-flex items-center gap-2 text-sm text-ink-600 hover:text-ink-900">
          <LogOut className="size-4" aria-hidden />
          ออกจากระบบ
        </button>
      </form>
    </main>
  );
}
