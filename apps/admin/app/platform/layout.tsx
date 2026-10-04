import { Building2, LayoutDashboard, LayoutTemplate, MonitorSmartphone, ScrollText, TriangleAlert } from 'lucide-react';
import { requirePlatform } from '@/server/auth/context';
import { PLATFORM_ROLE_LABELS } from '@/server/auth/rbac';
import { organizationsForUser } from '@/server/services/organizations';
import { AppShell } from '@/components/app-shell';

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requirePlatform();
  const orgs = await organizationsForUser(user.id);
  return (
    <AppShell
      variant="platform"
      user={user}
      roleLabel={PLATFORM_ROLE_LABELS[user.platformRole]}
      orgs={orgs}
      showPlatformLink
      sidebarFooter="ทุกการเปลี่ยนแปลงถูกบันทึกใน Audit log"
      nav={[
        { title: 'ภาพรวม', items: [{ href: '/platform/overview', label: 'ภาพรวมแพลตฟอร์ม', icon: <LayoutDashboard aria-hidden /> }] },
        {
          title: 'ลูกค้า',
          items: [
            { href: '/platform/organizations', label: 'บัญชีลูกค้า', icon: <Building2 aria-hidden /> },
            { href: '/platform/kiosks', label: 'ตู้ทั้งหมด', icon: <MonitorSmartphone aria-hidden /> }
          ]
        },
        {
          title: 'ระบบ',
          items: [
            { href: '/platform/templates', label: 'คลัง Template', icon: <LayoutTemplate aria-hidden /> },
            { href: '/platform/error-codes', label: 'รหัสข้อผิดพลาด', icon: <TriangleAlert aria-hidden /> },
            { href: '/platform/audit', label: 'Audit log', icon: <ScrollText aria-hidden /> }
          ]
        }
      ]}
    >
      {children}
    </AppShell>
  );
}
