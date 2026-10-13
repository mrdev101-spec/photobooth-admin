import Link from 'next/link';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { Building2, ChevronLeft, LayoutDashboard, SlidersHorizontal } from 'lucide-react';
import { requirePlatform } from '@/server/auth/context';
import { getPlatformKiosk } from '@/server/services/kiosks';
import { AppError } from '@/server/lib/errors';
import { RouteTabs } from '@/components/route-tabs';
import { Badge, PageHeader, buttonClass } from '@/components/ui';
import { STAGE_INFO, kioskStage } from '@/lib/kiosk-lifecycle';

/** One kiosk in the Platform: header (where it is, its stage) and its tabs. */
export default async function PlatformKioskLayout({ params, children }: { params: Promise<{ id: string }>; children: ReactNode }) {
  const { id } = await params;
  await requirePlatform();
  const { kiosk: k, org, branchName } = await getPlatformKiosk(id).catch((err) => {
    if (err instanceof AppError && err.code === 'not_found') notFound();
    throw err;
  });
  const inStock = org.kind === 'stock';
  const stage = STAGE_INFO[kioskStage(k, inStock)];
  const base = `/platform/kiosks/${k.id}`;

  return (
    <>
      <PageHeader
        breadcrumb={
          <Link href={`/platform/kiosks?tab=${k.archivedAt ? 'archived' : inStock ? 'stock' : 'shops'}`} className="inline-flex items-center gap-1 hover:text-ink-900">
            <ChevronLeft className="size-4" aria-hidden />
            ตู้
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            {k.name}
            <Badge tone={stage.tone} dot>
              {stage.label}
            </Badge>
          </span>
        }
        description={
          <>
            อยู่ที่: {inStock ? 'คลังตู้' : `${org.name} › ${branchName ?? 'ไม่มีสาขา'}`} • {k.kioskId ?? k.formerKioskId ?? 'ยังไม่เคยลงทะเบียน'}
          </>
        }
        actions={
          inStock ? null : (
            <Link href={`/platform/organizations/${org.id}`} className={buttonClass('outline')}>
              <Building2 className="size-5" aria-hidden />
              บัญชีร้าน {org.name}
            </Link>
          )
        }
      />
      <RouteTabs
        label="ส่วนของตู้"
        tabs={[
          { href: base, label: 'ภาพรวม', icon: <LayoutDashboard aria-hidden />, exact: true },
          { href: `${base}/settings`, label: 'การตั้งค่า', icon: <SlidersHorizontal aria-hidden /> }
        ]}
      />
      {children}
    </>
  );
}
