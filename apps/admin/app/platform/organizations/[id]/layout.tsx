import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, Eye, HardDrive, LayoutDashboard, MonitorSmartphone, ShieldCheck, Users } from 'lucide-react';
import { requirePlatform } from '@/server/auth/context';
import { getOrganization } from '@/server/services/organizations';
import { AppError } from '@/server/lib/errors';
import { RouteTabs } from '@/components/route-tabs';
import { Badge, PageHeader, buttonClass } from '@/components/ui';

/** Customer page in the Platform Console: header + tabs shared by every tab page. */
export default async function OrganizationLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePlatform();
  const org = await getOrganization(id).catch((err) => {
    if (err instanceof AppError && err.code === 'not_found') notFound();
    throw err;
  });
  const base = `/platform/organizations/${org.id}`;

  return (
    <>
      <PageHeader
        breadcrumb={
          <Link href="/platform/organizations" className="inline-flex items-center gap-1 hover:text-ink-900">
            <ChevronLeft className="size-4" aria-hidden />
            บัญชีลูกค้า
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            {org.name}
            {org.kind === 'stock' ? (
              <Badge tone="info" dot>
                คลังตู้ของแพลตฟอร์ม
              </Badge>
            ) : org.status === 'active' ? (
              <Badge tone="success" dot>
                ใช้งานอยู่
              </Badge>
            ) : (
              <Badge tone="danger" dot>
                ระงับ
              </Badge>
            )}
          </span>
        }
        description={org.slug}
        actions={
          org.kind === 'stock' ? null : (
          <Link href={`/o/${org.slug}/dashboard`} className={buttonClass('outline')}>
            <Eye className="size-5" aria-hidden />
            เข้าดูแบบซัพพอร์ต
          </Link>
          )
        }
      />
      <RouteTabs
        label="ส่วนของบัญชีลูกค้า"
        tabs={org.kind === 'stock' ? [{ href: `${base}/kiosks`, label: 'ตู้ในคลัง', icon: <MonitorSmartphone aria-hidden /> }] : [
          { href: base, label: 'ภาพรวม', icon: <LayoutDashboard aria-hidden />, exact: true },
          { href: `${base}/kiosks`, label: 'ตู้', icon: <MonitorSmartphone aria-hidden /> },
          { href: `${base}/users`, label: 'ผู้ใช้', icon: <Users aria-hidden /> },
          { href: `${base}/limits`, label: 'ขีดจำกัดและสิทธิ์', icon: <ShieldCheck aria-hidden /> },
          { href: `${base}/storage`, label: 'พื้นที่เก็บภาพ', icon: <HardDrive aria-hidden /> }
        ]}
      />
      {children}
    </>
  );
}
