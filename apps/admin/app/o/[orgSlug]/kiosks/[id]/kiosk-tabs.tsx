import Link from 'next/link';
import clsx from 'clsx';

const TABS = [
  { id: 'overview', label: 'ภาพรวม', path: '' },
  { id: 'config', label: 'การตั้งค่า', path: '/config' },
  { id: 'history', label: 'ประวัติการตั้งค่า', path: '/config/history' }
] as const;

export function KioskTabs({ base, active, paired }: { base: string; active: (typeof TABS)[number]['id']; paired: boolean }) {
  return (
    <nav aria-label="ส่วนของตู้" className="mb-6 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-ink-200">
      {TABS.filter((t) => paired || t.id === 'overview').map((t) => (
        <Link
          key={t.id}
          href={`${base}${t.path}`}
          aria-current={active === t.id ? 'page' : undefined}
          className={clsx(
            '-mb-px border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap',
            active === t.id ? 'border-primary-600 text-ink-900' : 'border-transparent text-ink-600 hover:text-ink-900'
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
