import type { Metadata } from 'next';
import Link from 'next/link';
import clsx from 'clsx';
import { MonitorSmartphone, Plus } from 'lucide-react';
import { requirePlatform } from '@/server/auth/context';
import { platformCatalog } from '@/server/services/catalog';
import { RouteTabs } from '@/components/route-tabs';
import { canPlatform } from '@/server/auth/rbac';
import { Badge, Notice, PageHeader, buttonClass } from '@/components/ui';
import { TEMPLATE_KINDS, type TemplateKind } from '@/lib/template-visibility';
import { TemplatePreview } from '@/components/template-preview';

export const metadata: Metadata = { title: 'คลัง Template' };

export default async function PlatformTemplatesPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const ctx = await requirePlatform();
  const canManage = canPlatform(ctx.user.platformRole, 'platform.catalog');
  const sp = await searchParams;
  const kind = (TEMPLATE_KINDS.some((k) => k.kind === sp.kind) ? sp.kind : 'photo-4x6') as TemplateKind;
  const { items, kiosksTotal } = await platformCatalog();
  const section = TEMPLATE_KINDS.find((k) => k.kind === kind)!;
  const rows = items.filter((i) => i.kind === kind);

  return (
    <>
      <PageHeader
        title="คลัง Template"
        description={`Template ที่ทุกตู้เลือกใช้ได้ ลูกค้าเลือกได้เพียงแสดงหรือซ่อน • ตู้ทั้งหมด ${kiosksTotal} ตู้`}
        actions={
          canManage ? (
            <Link href={`/platform/templates/new?kind=${kind}`} className={buttonClass()}>
              <Plus className="size-5" aria-hidden />
              เพิ่ม Template
            </Link>
          ) : null
        }
      />
      <Notice tone="info" className="mb-5">
        กดที่ template เพื่อดูรายละเอียด แก้ไข เลิกใช้หรือเปิดใช้ทั้งระบบ • <b>ในตัว</b> = วาดโดยโปรแกรมของตู้ • <b>อัปโหลด</b> = ส่วนกลางเพิ่มเอง (กรอบ PNG + ช่อง) ตู้ดาวน์โหลดไปใช้
      </Notice>
      <RouteTabs
        label="หมวด template"
        tabs={TEMPLATE_KINDS.map((k) => {
          const inKind = items.filter((i) => i.kind === k.kind);
          return { href: `/platform/templates?kind=${k.kind}`, label: k.label, count: `${inKind.filter((i) => i.status === 'published').length}/${inKind.length}`, active: k.kind === kind };
        })}
      />
      <p className="-mt-2 mb-4 text-sm text-ink-500">ใช้ใน{section.desc}</p>
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {rows.map((r) => (
          <li key={r.id}>
            <Link
              href={`/platform/templates/${r.kind}/${r.id}`}
              className={clsx('group flex h-full flex-col overflow-hidden rounded-card border border-ink-200 bg-surface shadow-card transition-colors hover:border-primary-600', r.status === 'retired' && 'opacity-70')}
            >
              <TemplatePreview kind={r.kind} src={r.image} className={clsx(r.status === 'retired' && 'grayscale')} />
              <span className="flex flex-1 flex-col gap-1 p-3">
                <span className="font-semibold text-ink-900 group-hover:text-primary-700">{r.name}</span>
                <span className="flex items-center gap-2">
                  <code className="truncate text-xs text-ink-500">{r.id}</code>
                  {r.source === 'uploaded' ? <Badge tone="violet">{r.ownerOrgId ? 'ของร้าน' : 'อัปโหลด'}</Badge> : null}
                </span>
                <span className="mt-auto flex flex-wrap items-center gap-2 pt-2">
                  {r.status === 'published' ? (
                    <Badge tone="success" dot>
                      เปิดใช้
                    </Badge>
                  ) : r.status === 'draft' ? (
                    <Badge tone="warning" dot>
                      ร่าง
                    </Badge>
                  ) : (
                    <Badge tone="neutral" dot>
                      เลิกใช้
                    </Badge>
                  )}
                  <span className="inline-flex items-center gap-1 text-xs text-ink-500">
                    <MonitorSmartphone className="size-3.5" aria-hidden />
                    {r.kiosks} ตู้
                  </span>
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
