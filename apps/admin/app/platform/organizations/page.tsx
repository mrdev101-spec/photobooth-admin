import { formatQuota } from '@/lib/quota';
import { Building2, Plus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePlatform } from '@/server/auth/context';
import { canPlatform } from '@/server/auth/rbac';
import { listOrganizations } from '@/server/services/organizations';
import { Badge, EmptyState, PageHeader, Table, Td, Th, buttonClass } from '@/components/ui';
import { formatDate, formatNumber } from '@/lib/format';

export const metadata: Metadata = { title: 'บัญชีลูกค้า' };

export default async function OrganizationsPage() {
  const { user } = await requirePlatform();
  const orgs = await listOrganizations();
  const canManage = canPlatform(user.platformRole, 'platform.org.manage');

  return (
    <>
      <PageHeader
        title="บัญชีลูกค้า"
        description="ลูกค้าแต่ละรายเห็นและจัดการได้เฉพาะตู้ของตัวเอง"
        actions={
          canManage ? (
            <Link href="/platform/organizations/new" className={buttonClass()}>
              <Plus className="size-5" aria-hidden />
              เพิ่มลูกค้า
            </Link>
          ) : null
        }
      />
      {orgs.length ? (
        <Table>
          <thead>
            <tr>
              <Th>ลูกค้า</Th>
              <Th>สถานะ</Th>
              <Th className="text-right">ผู้ใช้ / โควตา</Th>
              <Th className="text-right">ตู้ / โควตา</Th>
              <Th className="text-right">โควตา AI / เดือน</Th>
              <Th>สร้างเมื่อ</Th>
            </tr>
          </thead>
          <tbody>
            {orgs.map((o) => (
              <tr key={o.id} className="hover:bg-ink-50">
                <Td>
                  <Link href={`/platform/organizations/${o.id}`} className="font-semibold text-ink-900 hover:underline">
                    {o.name}
                  </Link>
                  <div className="text-xs text-ink-500">{o.slug}</div>
                </Td>
                <Td>{o.status === 'active' ? <Badge tone="success" dot>ใช้งานอยู่</Badge> : <Badge tone="danger" dot>ระงับ</Badge>}</Td>
                <Td className="text-right whitespace-nowrap">{formatQuota(o.members, o.userQuota)}</Td>
                <Td className="text-right whitespace-nowrap">{formatQuota(o.kiosks, o.kioskQuota)}</Td>
                <Td className="text-right">{o.aiMonthlyQuota == null ? 'ไม่จำกัด' : formatNumber(o.aiMonthlyQuota)}</Td>
                <Td>{formatDate(o.createdAt)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <EmptyState title="ยังไม่มีลูกค้า" icon={<Building2 aria-hidden />}>เพิ่มลูกค้ารายแรกพร้อมบัญชีเจ้าของ</EmptyState>
      )}
    </>
  );
}
