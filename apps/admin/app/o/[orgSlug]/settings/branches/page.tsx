import { MapPin, Plus } from 'lucide-react';
import type { Metadata } from 'next';
import { requireOrg } from '@/server/auth/context';
import { can } from '@/server/auth/rbac';
import { listBranches } from '@/server/services/branches';
import { ActionForm, FormField, SubmitButton } from '@/components/form';
import { Badge, Card, EmptyState, Input, PageHeader } from '@/components/ui';
import { createBranchAction, setBranchActiveAction, updateBranchAction } from './actions';

export const metadata: Metadata = { title: 'สาขา' };

export default async function BranchesPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const ctx = await requireOrg(orgSlug, 'branch.view');
  const rows = await listBranches(ctx);
  const canManage = can(ctx.principal, 'branch.manage');

  return (
    <>
      <PageHeader title="สาขา" description="สาขาหรืองานอีเวนต์ ใช้จัดกลุ่มตู้และจุดรับรูป และจำกัดสิทธิ์ผู้ใช้" />

      {canManage ? (
        <Card title="เพิ่มสาขา" icon={<Plus aria-hidden />} className="mb-6 max-w-3xl">
          <ActionForm action={createBranchAction.bind(null, orgSlug)} resetOnSuccess className="grid gap-4 sm:grid-cols-[1fr_1.5fr_auto] sm:items-end">
            <FormField label="ชื่อสาขา" name="name">
              <Input id="name" name="name" required maxLength={120} placeholder="Central World" />
            </FormField>
            <FormField label="ที่อยู่ / รายละเอียด" name="address">
              <Input id="address" name="address" maxLength={500} />
            </FormField>
            <SubmitButton>เพิ่มสาขา</SubmitButton>
          </ActionForm>
        </Card>
      ) : null}

      {rows.length ? (
        <div className="flex max-w-3xl flex-col gap-3">
          {rows.map((b) => (
            <Card key={b.id} title={b.name} icon={<MapPin aria-hidden />} actions={b.isActive ? <Badge tone="success" dot>ใช้งาน</Badge> : <Badge dot>ปิดแล้ว</Badge>}>
              {canManage ? (
                <div className="flex flex-col gap-3">
                  <ActionForm action={updateBranchAction.bind(null, orgSlug, b.id)} className="grid gap-4 sm:grid-cols-[1fr_1.5fr_auto] sm:items-end">
                    <FormField label="ชื่อสาขา" name="name">
                      <Input name="name" defaultValue={b.name} required maxLength={120} aria-label="ชื่อสาขา" />
                    </FormField>
                    <FormField label="ที่อยู่ / รายละเอียด" name="address">
                      <Input name="address" defaultValue={b.address} maxLength={500} aria-label="ที่อยู่" />
                    </FormField>
                    <SubmitButton variant="outline">บันทึก</SubmitButton>
                  </ActionForm>
                  <div className="flex items-center justify-between border-t border-ink-100 pt-3">
                    <span />
                    <ActionForm
                      action={setBranchActiveAction.bind(null, orgSlug, b.id, !b.isActive)}
                      confirm={b.isActive ? `ปิดสาขา "${b.name}"? ข้อมูลเดิมยังอยู่ เปิดกลับได้ภายหลัง` : undefined}
                    >
                      <SubmitButton variant="ghost" size="sm">
                        {b.isActive ? 'ปิดสาขา' : 'เปิดสาขา'}
                      </SubmitButton>
                    </ActionForm>
                  </div>
                </div>
              ) : (
                <p className="text-ink-600">{b.address || 'ไม่มีรายละเอียด'}</p>
              )}
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState title="ยังไม่มีสาขา" icon={<MapPin aria-hidden />} />
      )}
    </>
  );
}
