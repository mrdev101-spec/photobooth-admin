import type { Metadata } from 'next';
import Link from 'next/link';
import { Info, MonitorSmartphone } from 'lucide-react';
import { requireOrg } from '@/server/auth/context';
import { can } from '@/server/auth/rbac';
import { listKiosks } from '@/server/services/kiosks';
import { kioskGallery } from '@/server/services/catalog';
import { RouteTabs } from '@/components/route-tabs';
import { EmptyState, Notice, PageHeader, Select, buttonClass } from '@/components/ui';
import { resolvePermissions } from '@/lib/config-permissions';
import { TEMPLATE_KINDS, type TemplateKind } from '@/lib/template-visibility';
import { TemplateGallery } from './template-gallery';
import { ShopTemplates } from './shop-templates';

export const metadata: Metadata = { title: 'Template' };

export default async function TemplatesPage({ params, searchParams }: { params: Promise<{ orgSlug: string }>; searchParams: Promise<{ kiosk?: string; kind?: string }> }) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const ctx = await requireOrg(orgSlug, 'kiosk.view');
  const kiosks = (await listKiosks(ctx)).filter((k) => k.kiosk.currentRevision > 0);
  const base = `/o/${ctx.org.slug}/templates`;
  const own = <ShopTemplates orgSlug={ctx.org.slug} orgId={ctx.org.id} canManage={can(ctx.principal, 'template.manage')} />;

  if (!kiosks.length) {
    return (
      <>
        <PageHeader title="Template" description="เลือกว่าตู้แต่ละตู้แสดง template ไหนให้ลูกค้าเลือก" />
        {own}
        <EmptyState title="ยังไม่มีตู้ที่เชื่อมต่อ" icon={<MonitorSmartphone aria-hidden />}>
          เลือก template ได้หลังจากตู้เชื่อมต่อแล้ว
        </EmptyState>
      </>
    );
  }

  const kioskRowId = kiosks.some((k) => k.kiosk.id === sp.kiosk) ? sp.kiosk! : kiosks[0]!.kiosk.id;
  const kind = (TEMPLATE_KINDS.some((k) => k.kind === sp.kind) ? sp.kind : 'photo-4x6') as TemplateKind;
  const gallery = await kioskGallery(ctx, kioskRowId);
  const section = gallery.kinds.find((k) => k.kind === kind)!;
  const permission = resolvePermissions(ctx.org.configPermissions).templates;
  const canEdit = can(ctx.principal, 'config.edit') && (!!ctx.principal.platformRole || permission === 'edit');
  const hidden = !ctx.principal.platformRole && permission === 'hidden';

  return (
    <>
      <PageHeader
        title="Template"
        description="เลือกว่าตู้แต่ละตู้แสดง template ไหนให้ลูกค้าเลือก"
        actions={
          <form action={base} className="flex items-center gap-2">
            <input type="hidden" name="kind" value={kind} />
            <Select name="kiosk" defaultValue={kioskRowId} wrapperClassName="w-60" className="h-10" aria-label="ตู้">
              {kiosks.map(({ kiosk: k }) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </Select>
            <button type="submit" className={buttonClass('outline', 'sm', 'h-10')}>
              เลือกตู้
            </button>
          </form>
        }
      />

      <Notice tone="info" className="mb-5">
        <span className="inline-flex items-start gap-1">
          <Info className="sr-only" aria-hidden />
          Template จากผู้ให้บริการ และ template ของร้าน (ถ้าเปิดสิทธิ์) เลือกได้ว่าตู้ไหนแสดงหรือซ่อน •{' '}
          <Link href={`/o/${ctx.org.slug}/kiosks/${kioskRowId}/config`} className="underline">
            ตั้งแบบเริ่มต้นและค่าอื่นของตู้
          </Link>
        </span>
      </Notice>

      {own}

      {hidden ? (
        <Notice tone="warn">หมวดนี้จัดการโดยผู้ให้บริการ</Notice>
      ) : (
        <>
          <RouteTabs
            label="หมวด template"
            tabs={gallery.kinds.map((k) => ({
              href: `${base}?kiosk=${kioskRowId}&kind=${k.kind}`,
              label: k.label,
              count: `${k.items.filter((i) => i.shown).length}/${k.items.length}`,
              active: k.kind === kind
            }))}
          />
          <p className="-mt-2 mb-4 text-sm text-ink-500">ใช้ใน{section.desc}</p>
          <TemplateGallery
            key={`${kioskRowId}-${kind}`}
            orgSlug={ctx.org.slug}
            kind={kind}
            items={section.items}
            kioskRowId={kioskRowId}
            allKioskIds={kiosks.map((k) => k.kiosk.id)}
            locked={!canEdit}
            supportsUploaded={gallery.supportsUploaded}
          />
        </>
      )}
    </>
  );
}
