import type { Metadata } from 'next';
import { KeyRound, Trash2, UserPlus, Users } from 'lucide-react';
import { ORG_ROLES } from '@/server/db/schema';
import { orgContextForPlatform, requirePlatform } from '@/server/auth/context';
import { ORG_ROLE_LABELS, canPlatform } from '@/server/auth/rbac';
import { listMembers, memberUsage } from '@/server/services/members';
import { ActionForm, FormField, SubmitButton } from '@/components/form';
import { Badge, Card, Input, Notice, Select, Table, Td, Th } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import { formatQuota, isFull } from '@/lib/quota';
import { addUserAction, removeUserAction, resetUserPasswordAction } from '../actions';

export const metadata: Metadata = { title: 'ผู้ใช้ของลูกค้า' };

export default async function OrganizationUsersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const platform = await requirePlatform();
  const ctx = await orgContextForPlatform(platform, id);
  const canManage = canPlatform(platform.user.platformRole, 'platform.org.manage');
  const [members, usage] = await Promise.all([listMembers(ctx), memberUsage(ctx)]);
  const full = isFull(usage.used, usage.quota);

  return (
    <div className="flex flex-col gap-5">
      {canManage ? (
        <Card title="เพิ่มผู้ใช้ให้ลูกค้า" subtitle={`ใช้ ${formatQuota(usage.used, usage.quota)} คน • บัญชีใหม่ได้รหัสผ่านชั่วคราว ต้องเปลี่ยนเมื่อเข้าครั้งแรก`} icon={<UserPlus aria-hidden />}>
          {full ? (
            <Notice tone="warn" className="mb-4">
              ครบโควตาผู้ใช้แล้ว ลูกค้าจะเพิ่มผู้ใช้เองไม่ได้ ทีมแพลตฟอร์มยังเพิ่มเกินได้ (เช่น บัญชีชั่วคราว) หรือเพิ่มโควตาที่แท็บ “ขีดจำกัดและสิทธิ์”
            </Notice>
          ) : null}
          <ActionForm action={addUserAction.bind(null, id)} resetOnSuccess className="grid gap-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
            <FormField label="อีเมล" name="email" required>
              <Input id="email" name="email" type="email" required />
            </FormField>
            <FormField label="ชื่อ" name="name" required>
              <Input id="name" name="name" required maxLength={120} />
            </FormField>
            <FormField label="บทบาท" name="role">
              <Select id="role" name="role" defaultValue="owner">
                {ORG_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ORG_ROLE_LABELS[r]}
                  </option>
                ))}
              </Select>
            </FormField>
            <SubmitButton>เพิ่มผู้ใช้</SubmitButton>
          </ActionForm>
          <p className="mt-3 text-sm text-ink-500">ผู้ใช้ที่เพิ่มจากที่นี่เข้าถึงได้ทุกสาขา จำกัดสาขาได้ที่หน้าสมาชิกของลูกค้า (เข้าดูแบบซัพพอร์ต)</p>
        </Card>
      ) : null}

      <Card flush title="ผู้ใช้ของลูกค้า" subtitle={`${formatQuota(usage.used, usage.quota)} คน`} icon={<Users aria-hidden />}>
        <Table bare>
          <thead>
            <tr>
              <Th>ชื่อ</Th>
              <Th>บทบาท</Th>
              <Th>เข้าระบบล่าสุด</Th>
              {canManage ? <Th className="text-right">จัดการ</Th> : null}
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.userId} className="align-top">
                <Td>
                  <div className="font-semibold text-ink-900">{m.name}</div>
                  <div className="text-sm text-ink-500">{m.email}</div>
                  {m.mustChangePassword ? (
                    <Badge tone="warning" dot className="mt-1">
                      ยังไม่ได้ตั้งรหัสผ่าน
                    </Badge>
                  ) : null}
                </Td>
                <Td>
                  <Badge tone={m.role === 'owner' ? 'primary' : 'neutral'}>{ORG_ROLE_LABELS[m.role]}</Badge>
                  <div className="mt-1 text-xs text-ink-500">{m.allBranches ? 'ทุกสาขา' : `${m.branchIds.length} สาขา`}</div>
                </Td>
                <Td className="whitespace-nowrap text-ink-600">{formatDateTime(m.lastLoginAt)}</Td>
                {canManage ? (
                  <Td className="text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      <ActionForm action={resetUserPasswordAction.bind(null, id, m.userId, m.email)} confirm={`รีเซ็ตรหัสผ่านของ ${m.email}? ผู้ใช้จะถูกออกจากระบบทุกเครื่อง`}>
                        <SubmitButton variant="outline" size="sm">
                          <KeyRound className="size-4" aria-hidden />
                          รีเซ็ตรหัสผ่าน
                        </SubmitButton>
                      </ActionForm>
                      <ActionForm action={removeUserAction.bind(null, id, m.userId)} confirm={`ลบ ${m.email} ออกจากบัญชีนี้?`}>
                        <SubmitButton variant="ghost" size="sm">
                          <Trash2 className="size-4" aria-hidden />
                          ลบ
                        </SubmitButton>
                      </ActionForm>
                    </div>
                  </Td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
