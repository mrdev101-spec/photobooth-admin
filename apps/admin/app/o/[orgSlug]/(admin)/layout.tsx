import { ChartColumn, Eye, Layers, HardDrive, LayoutDashboard, LayoutTemplate, MapPin, MonitorSmartphone, PackageCheck, ReceiptText, ScrollText, Users, Landmark } from 'lucide-react';
import { getOrgContext } from '@/server/auth/context';
import { ORG_ROLE_LABELS, PLATFORM_ROLE_LABELS, can } from '@/server/auth/rbac';
import { organizationsForUser } from '@/server/services/organizations';
import { AppShell, type NavSection } from '@/components/app-shell';
import { ConsoleHeaderLink } from '@/components/console-header-link';
import type { NavItem } from '@/components/shell-nav';

export default async function OrgLayout({ children, params }: { children: React.ReactNode; params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const ctx = await getOrgContext(orgSlug);
  const orgs = await organizationsForUser(ctx.user.id);
  const base = `/o/${ctx.org.slug}`;
  const p = ctx.principal;

  const nav: NavSection[] = [
    { title: ctx.org.name, items: [{ href: `${base}/dashboard`, label: 'ภาพรวม', icon: <LayoutDashboard aria-hidden /> }] },
    {
      title: 'หน้างาน',
      items: ([
        can(p, 'pickup.use') && { href: `${base}/pickup`, label: 'จุดรับรูป', icon: <PackageCheck aria-hidden /> },
        can(p, 'order.view') && { href: `${base}/orders`, label: 'ออเดอร์', icon: <ReceiptText aria-hidden /> },
        can(p, 'report.view') && { href: `${base}/sales`, label: 'ยอดขาย', icon: <ChartColumn aria-hidden /> }
      ] as (NavItem | false)[]).filter((x): x is NavItem => !!x)
    },
    {
      title: 'ตู้',
      items: ([
        can(p, 'kiosk.view') && { href: `${base}/kiosks`, label: 'ตู้ทั้งหมด', icon: <MonitorSmartphone aria-hidden /> },
        can(p, 'kiosk.view') && { href: `${base}/events`, label: 'ค่ากลางและงาน', icon: <Layers aria-hidden /> },
        can(p, 'kiosk.view') && { href: `${base}/templates`, label: 'Template', icon: <LayoutTemplate aria-hidden /> }
      ] as (NavItem | false)[]).filter((x): x is NavItem => !!x)
    },
    {
      title: 'ตั้งค่า',
      items: ([
        can(p, 'branch.view') && { href: `${base}/settings/branches`, label: 'สาขา', icon: <MapPin aria-hidden /> },
        can(p, 'member.view') && { href: `${base}/settings/members`, label: 'สมาชิก', icon: <Users aria-hidden /> },
        can(p, 'kiosk.view') && { href: `${base}/settings/storage`, label: 'พื้นที่เก็บภาพ', icon: <HardDrive aria-hidden /> },
        can(p, 'payment.view') && { href: `${base}/settings/payments`, label: 'การรับเงิน', icon: <Landmark aria-hidden /> },
        can(p, 'audit.view') && { href: `${base}/settings/audit`, label: 'Audit log', icon: <ScrollText aria-hidden /> }
      ] as (NavItem | false)[]).filter((x): x is NavItem => !!x)
    }
  ].filter((s) => s.items.length > 0);

  const roleLabel = p.orgRole ? ORG_ROLE_LABELS[p.orgRole] : p.platformRole ? PLATFORM_ROLE_LABELS[p.platformRole] : '';

  return (
    <AppShell
      user={ctx.user}
      roleLabel={roleLabel}
      orgs={orgs}
      currentSlug={ctx.org.slug}
      showPlatformLink={!!ctx.user.platformRole}
      nav={nav}
      headerActions={can(p, 'console.view') ? <ConsoleHeaderLink href={`${base}/studio`} /> : null}
      banner={
        ctx.actingAsPlatform ? (
          <div role="status" className="flex items-center justify-center gap-2 bg-ink-900 px-4 py-2 text-center text-sm font-medium text-white">
            <Eye className="size-4 shrink-0" aria-hidden />
            คุณกำลังดูบัญชีของลูกค้าในฐานะทีมแพลตฟอร์ม ทุกการเปลี่ยนแปลงถูกบันทึกใน Audit log
          </div>
        ) : ctx.org.status === 'suspended' ? (
          <div role="status" className="bg-danger-600 px-4 py-2 text-center text-sm font-medium text-white">
            บัญชีนี้ถูกระงับ
          </div>
        ) : null
      }
    >
      {children}
    </AppShell>
  );
}
