import { Settings2, UserPlus, Users } from 'lucide-react';
import type { Metadata } from 'next';
import { ORG_ROLES, type Branch, type OrgRole } from '@/server/db/schema';
import { requireOrg } from '@/server/auth/context';
import { ORG_ROLE_LABELS, can } from '@/server/auth/rbac';
import { listMembers, memberUsage } from '@/server/services/members';
import { formatQuota, isFull } from '@/lib/quota';
import { listBranches } from '@/server/services/branches';
import { ActionForm, FieldError, FormField, SubmitButton } from '@/components/form';
import { Badge, Card, Input, Notice, PageHeader, Select, Table, Td, Th } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import { addMemberAction, removeMemberAction, resetPasswordAction, updateMemberAction } from './actions';

export const metadata: Metadata = { title: 'สมาชิก' };

const ROLE_HINTS: Record<OrgRole, string> = {
  owner: 'ทุกอย่างในบัญชี รวมสมาชิกและสาขา',
  manager: 'ตู้ การตั้งค่า template ออเดอร์ รายงาน (จำกัดสาขาได้)',
  designer: 'template และธีมงาน',
  pickup_staff: 'หน้าจุดรับรูปเท่านั้น (จำกัดสาขาได้)',
  event_staff: 'Event Console เท่านั้น: ดูตู้ คิวพิมพ์ ภาพ สั่งพิมพ์ซ้ำ/ยกเลิกคิว (จำกัดสาขาได้)',
  viewer: 'ดูภาพรวมและรายงาน'
};

function RoleAndBranches({ branches, role, allBranches = true, branchIds = [], idPrefix }: { branches: Branch[]; role?: OrgRole; allBranches?: boolean; branchIds?: string[]; idPrefix: string }) {
  return (
    <>
      <FormField label="บทบาท" name="role">
        <Select id={`${idPrefix}-role`} name="role" defaultValue={role ?? 'manager'}>
          {ORG_ROLES.map((r) => (
            <option key={r} value={r}>
              {ORG_ROLE_LABELS[r]} — {ROLE_HINTS[r]}
            </option>
          ))}
        </Select>
      </FormField>
      <fieldset className="flex flex-col gap-2 sm:col-span-2">
        <legend className="mb-1.5 text-sm font-medium text-ink-600">สาขาที่เข้าถึงได้</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="allBranches" defaultChecked={allBranches} className="size-4" />
          ทุกสาขา (รวมสาขาที่เพิ่มภายหลัง)
        </label>
        <div className="flex flex-wrap gap-x-5 gap-y-2 pl-6">
          {branches.map((b) => (
            <label key={b.id} className="flex items-center gap-2 text-sm text-ink-600">
              <input type="checkbox" name="branchIds" value={b.id} defaultChecked={branchIds.includes(b.id)} className="size-4" />
              {b.name}
            </label>
          ))}
        </div>
        <p className="text-xs text-ink-500">ถ้าไม่ติ๊ก "ทุกสาขา" ผู้ใช้จะเห็นเฉพาะสาขาที่เลือก (มีผลกับผู้จัดการและพนักงานจุดรับรูป)</p>
        <FieldError name="branchIds" />
      </fieldset>
    </>
  );
}

export default async function MembersPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const ctx = await requireOrg(orgSlug, 'member.view');
  const [members, branches, usage] = await Promise.all([listMembers(ctx), listBranches(ctx), memberUsage(ctx)]);
  const full = isFull(usage.used, usage.quota) && !ctx.principal.platformRole;
  const canManage = can(ctx.principal, 'member.manage');
  const canReset = ctx.principal.orgRole === 'owner' || ctx.principal.platformRole === 'platform_admin';
  const branchName = new Map(branches.map((b) => [b.id, b.name]));

  return (
    <>
      <PageHeader title="สมาชิก" description="ผู้ใช้ที่เข้าจัดการบัญชีนี้ได้" />

      {canManage ? (
        <Card title="เพิ่มสมาชิก" subtitle={`ใช้ ${formatQuota(usage.used, usage.quota)} คน • บัญชีใหม่ได้รหัสผ่านชั่วคราว ต้องเปลี่ยนเมื่อเข้าครั้งแรก`} icon={<UserPlus aria-hidden />} className="mb-6 max-w-3xl">
          {full ? (
            <Notice tone="warn" title={`ผู้ใช้ครบ ${usage.quota} คนแล้ว`}>
              จำนวนผู้ใช้สูงสุดกำหนดโดยผู้ให้บริการ ลบผู้ใช้ที่ไม่ใช้แล้ว หรือติดต่อผู้ให้บริการเพื่อเพิ่ม
            </Notice>
          ) : (
          <ActionForm action={addMemberAction.bind(null, orgSlug)} resetOnSuccess className="grid gap-4 sm:grid-cols-2">
            <FormField label="อีเมล" name="email">
              <Input id="email" name="email" type="email" required />
            </FormField>
            <FormField label="ชื่อ" name="name">
              <Input id="name" name="name" required maxLength={120} />
            </FormField>
            <RoleAndBranches branches={branches} idPrefix="new" />
            <div className="sm:col-span-2">
              <SubmitButton>เพิ่มสมาชิก</SubmitButton>
            </div>
          </ActionForm>
          )}
        </Card>
      ) : null}

      <Card flush title="สมาชิกทั้งหมด" subtitle={`${formatQuota(usage.used, usage.quota)} คน`} icon={<Users aria-hidden />}>
      <Table bare>
        <thead>
          <tr>
            <Th>ชื่อ</Th>
            <Th>บทบาท</Th>
            <Th>สาขา</Th>
            <Th>เข้าระบบล่าสุด</Th>
            {canManage ? <Th /> : null}
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.userId} className="align-top">
              <Td>
                <div className="font-semibold text-ink-900">
                  {m.name} {m.userId === ctx.user.id ? <span className="text-xs text-ink-500">(คุณ)</span> : null}
                </div>
                <div className="text-xs text-ink-500">{m.email}</div>
                {m.mustChangePassword ? <Badge tone="warning" dot className="mt-1">ยังไม่ได้ตั้งรหัสผ่าน</Badge> : null}
              </Td>
              <Td>
                <Badge tone={m.role === 'owner' ? 'primary' : 'neutral'}>{ORG_ROLE_LABELS[m.role]}</Badge>
              </Td>
              <Td className="text-ink-600">{m.allBranches ? 'ทุกสาขา' : m.branchIds.map((id) => branchName.get(id) ?? id).join(', ') || 'ไม่มี'}</Td>
              <Td className="whitespace-nowrap">{formatDateTime(m.lastLoginAt)}</Td>
              {canManage ? (
                <Td className="min-w-40">
                  <details>
                    <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-lg border border-ink-300 px-3 py-1.5 text-sm font-medium text-ink-800 hover:bg-ink-50"><Settings2 className="size-4" aria-hidden />จัดการ</summary>
                    <div className="mt-3 flex w-[min(36rem,80vw)] flex-col gap-4 rounded-card border border-ink-200 bg-ink-50 p-4">
                      <ActionForm action={updateMemberAction.bind(null, orgSlug, m.userId)} className="grid gap-4 sm:grid-cols-2">
                        <RoleAndBranches branches={branches} role={m.role} allBranches={m.allBranches} branchIds={m.branchIds} idPrefix={m.userId} />
                        <div className="sm:col-span-2">
                          <SubmitButton size="sm">บันทึก</SubmitButton>
                        </div>
                      </ActionForm>
                      <div className="flex flex-wrap gap-3 border-t border-ink-200 pt-3">
                        {canReset && m.userId !== ctx.user.id ? (
                          <ActionForm action={resetPasswordAction.bind(null, orgSlug, m.userId, m.email)} confirm={`รีเซ็ตรหัสผ่านของ ${m.email}? ผู้ใช้จะถูกออกจากระบบทุกเครื่อง`}>
                            <SubmitButton variant="outline" size="sm">
                              รีเซ็ตรหัสผ่าน
                            </SubmitButton>
                          </ActionForm>
                        ) : null}
                        {m.userId !== ctx.user.id ? (
                          <ActionForm action={removeMemberAction.bind(null, orgSlug, m.userId)} confirm={`ลบ ${m.email} ออกจากบัญชีนี้?`}>
                            <SubmitButton variant="danger" size="sm">
                              ลบออกจากบัญชี
                            </SubmitButton>
                          </ActionForm>
                        ) : null}
                      </div>
                    </div>
                  </details>
                </Td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </Table>
      </Card>
    </>
  );
}
