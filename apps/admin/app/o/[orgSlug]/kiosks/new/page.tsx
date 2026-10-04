import { ChevronLeft, MonitorSmartphone } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { requireOrg } from '@/server/auth/context';
import { can } from '@/server/auth/rbac';
import { listBranches } from '@/server/services/branches';
import { canManageFleet, kioskQuotaUsage } from '@/server/services/kiosks';
import { formatQuota, isFull } from '@/lib/quota';
import { ActionForm, FormField, SubmitButton } from '@/components/form';
import { Card, Input, Notice, PageHeader, Select } from '@/components/ui';
import { createKioskAction } from '../actions';

export const metadata: Metadata = { title: 'เพิ่มตู้' };

export default async function NewKioskPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const ctx = await requireOrg(orgSlug, 'kiosk.manage');
  const [branches, quota] = await Promise.all([listBranches(ctx), kioskQuotaUsage(ctx)]);
  const usable = branches.filter((b) => b.isActive && can(ctx.principal, 'kiosk.manage', { branchId: b.id }));

  return (
    <>
      <PageHeader
        breadcrumb={
          <Link href={`/o/${ctx.org.slug}/kiosks`} className="inline-flex items-center gap-1 hover:text-ink-900">
            <ChevronLeft className="size-4" aria-hidden />
            ตู้ทั้งหมด
          </Link>
        }
        title="เพิ่มตู้"
        description={`ใช้ ${formatQuota(quota.used, quota.quota)} ตู้ • หลังเพิ่มจะได้รหัสจับคู่สำหรับกรอกที่ตู้`}
      />
      <Card className="max-w-xl" title="ข้อมูลตู้" icon={<MonitorSmartphone aria-hidden />}>
        {!canManageFleet(ctx) ? (
          <Notice tone="info">ผู้ให้บริการเป็นผู้ลงทะเบียนและติดตั้งตู้ให้บัญชีนี้ ติดต่อผู้ให้บริการเมื่อต้องการเพิ่มตู้</Notice>
        ) : isFull(quota.used, quota.quota) ? (
          <Notice tone="warn">บัญชีนี้มีตู้ครบ {quota.quota} เครื่องตามโควตาแล้ว ติดต่อผู้ดูแลแพลตฟอร์มเพื่อเพิ่ม</Notice>
        ) : !usable.length ? (
          <Notice tone="warn">ยังไม่มีสาขาที่คุณเพิ่มตู้ได้</Notice>
        ) : (
          <ActionForm action={createKioskAction.bind(null, orgSlug)} className="flex flex-col gap-4">
            <FormField label="ชื่อตู้" name="name" hint="ชื่อที่ทีมใช้เรียก เช่น Booth A หน้าลานกิจกรรม">
              <Input id="name" name="name" required maxLength={100} autoFocus />
            </FormField>
            <FormField label="สาขา" name="branchId">
              <Select id="branchId" name="branchId" required defaultValue={usable[0]!.id}>
                {usable.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <div>
              <SubmitButton>เพิ่มและสร้างรหัสจับคู่</SubmitButton>
            </div>
          </ActionForm>
        )}
      </Card>
    </>
  );
}
