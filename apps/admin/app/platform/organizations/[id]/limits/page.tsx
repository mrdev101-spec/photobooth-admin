import type { Metadata } from 'next';
import clsx from 'clsx';
import { Gauge, ShieldCheck } from 'lucide-react';
import { orgContextForPlatform, requirePlatform } from '@/server/auth/context';
import { canPlatform } from '@/server/auth/rbac';
import { ActionForm, FormField, SubmitButton } from '@/components/form';
import { Card, Input } from '@/components/ui';
import { CONFIG_SECTIONS, DEFAULT_CONFIG_PERMISSIONS, PERMISSION_LABELS, resolvePermissions, type PermissionLevel } from '@/lib/config-permissions';
import { updateLimitsAction } from '../actions';

export const metadata: Metadata = { title: 'ขีดจำกัดและสิทธิ์' };

const LEVELS: PermissionLevel[] = ['edit', 'view', 'hidden'];

export default async function OrganizationLimitsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const platform = await requirePlatform();
  const { org } = await orgContextForPlatform(platform, id);
  const canManage = canPlatform(platform.user.platformRole, 'platform.org.manage');
  const perms = resolvePermissions(org.configPermissions);

  return (
    <ActionForm action={updateLimitsAction.bind(null, id)} className="flex flex-col gap-5 pb-4">
      <Card title="ขีดจำกัด" subtitle="เว้นว่าง = ไม่จำกัด เมื่อครบ ลูกค้าจะเพิ่มต่อเองไม่ได้" icon={<Gauge aria-hidden />}>
        <fieldset disabled={!canManage} className="grid gap-5 sm:grid-cols-3">
          <FormField label="จำนวนตู้สูงสุด" name="kioskQuota" hint="นับตู้รอจับคู่ ใช้งาน และปิดใช้งาน">
            <Input id="kioskQuota" name="kioskQuota" type="number" min={0} defaultValue={org.kioskQuota ?? ''} placeholder="ไม่จำกัด" />
          </FormField>
          <FormField label="จำนวนผู้ใช้สูงสุด" name="userQuota" hint="นับทุกบทบาทรวมเจ้าของ">
            <Input id="userQuota" name="userQuota" type="number" min={0} defaultValue={org.userQuota ?? ''} placeholder="ไม่จำกัด" />
          </FormField>
          <FormField label="ภาพ AI ต่อเดือน" name="aiMonthlyQuota">
            <Input id="aiMonthlyQuota" name="aiMonthlyQuota" type="number" min={0} defaultValue={org.aiMonthlyQuota ?? ''} placeholder="ไม่จำกัด" />
          </FormField>
          <label className="flex items-start gap-3 rounded-lg border border-ink-200 p-4 sm:col-span-3">
            <input type="checkbox" name="customerCanAddKiosks" defaultChecked={org.customerCanAddKiosks} className="mt-1 size-5 accent-primary-600" />
            <span>
              <span className="font-semibold text-ink-900">ลูกค้าเพิ่มและจับคู่ตู้เองได้</span>
              <span className="block text-sm text-ink-500">ปิด (ค่าเริ่มต้น) = ทีมแพลตฟอร์มเป็นผู้ลงทะเบียน จับคู่ และยกเลิกการเชื่อมต่อตู้ ลูกค้าจะไม่เห็นปุ่มเหล่านี้</span>
            </span>
          </label>
        </fieldset>
      </Card>

      <Card flush title="สิทธิ์ตั้งค่าตู้ของลูกค้า" subtitle="ใช้กับทุกตู้ของลูกค้านี้ ทีมแพลตฟอร์มแก้ได้ทุกหมวดเสมอ" icon={<ShieldCheck aria-hidden />}>
        <fieldset disabled={!canManage}>
          <table className="w-full border-collapse text-left">
            <thead>
              <tr>
                <th scope="col" className="border-b border-ink-200 bg-ink-50 px-4 py-3 text-sm font-semibold text-ink-600">
                  หมวด
                </th>
                {LEVELS.map((l) => (
                  <th key={l} scope="col" className="w-32 border-b border-ink-200 bg-ink-50 px-4 py-3 text-center text-sm font-semibold text-ink-600">
                    {PERMISSION_LABELS[l]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CONFIG_SECTIONS.map((s) => (
                <tr key={s.id} className="border-b border-ink-100 last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-ink-900">{s.label}</div>
                    <div className="text-sm text-ink-500">
                      {s.desc}
                      {perms[s.id] !== DEFAULT_CONFIG_PERMISSIONS[s.id] ? <span className="ml-2 text-warning-700">(ต่างจากค่าเริ่มต้น: {PERMISSION_LABELS[DEFAULT_CONFIG_PERMISSIONS[s.id]]})</span> : null}
                    </div>
                  </td>
                  {LEVELS.map((l) => (
                    <td key={l} className="px-4 py-3 text-center">
                      <label className={clsx('inline-flex cursor-pointer items-center justify-center rounded-full p-1.5', 'has-[:checked]:bg-primary-50')}>
                        <input type="radio" name={`perm.${s.id}`} value={l} defaultChecked={perms[s.id] === l} className="size-5 accent-primary-600" aria-label={`${s.label}: ${PERMISSION_LABELS[l]}`} />
                      </label>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </fieldset>
      </Card>

      {canManage ? (
        <div>
          <SubmitButton>บันทึกขีดจำกัดและสิทธิ์</SubmitButton>
        </div>
      ) : null}
    </ActionForm>
  );
}
