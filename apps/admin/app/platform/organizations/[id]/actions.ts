'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { orgContextForPlatform, requirePlatform } from '@/server/auth/context';
import { LimitsInput, updateLimits } from '@/server/services/organizations';
import { DisableInput, KioskInput, createKiosk, setKioskEnabled, unpairKiosk } from '@/server/services/kiosks';
import { MemberInput, addMember, removeMember, resetMemberPassword } from '@/server/services/members';
import { CONFIG_SECTIONS } from '@/lib/config-permissions';
import { formObject, runAction, type ActionState } from '@/server/lib/action';

/** Platform Console actions on one customer. The org comes from the URL id, checked by orgContextForPlatform. */

const path = (orgId: string, tab = '') => `/platform/organizations/${orgId}${tab}`;

export async function updateLimitsAction(orgId: string, _: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requirePlatform('platform.org.manage');
    const raw = formObject(form, { booleans: ['customerCanAddKiosks'] });
    const configPermissions: Record<string, string> = {};
    for (const s of CONFIG_SECTIONS) configPermissions[s.id] = String(form.get(`perm.${s.id}`) ?? 'edit');
    await updateLimits(ctx, orgId, LimitsInput.parse({ ...raw, configPermissions }));
    revalidatePath(path(orgId), 'layout');
    return { ok: true, message: 'บันทึกขีดจำกัดและสิทธิ์แล้ว' };
  });
}

export async function registerKioskAction(orgId: string, _: ActionState, form: FormData): Promise<ActionState> {
  let kioskId = '';
  const result = await runAction(async () => {
    const platform = await requirePlatform('platform.org.manage');
    const ctx = await orgContextForPlatform(platform, orgId);
    kioskId = await createKiosk(ctx, KioskInput.parse(formObject(form)));
    return { ok: true };
  });
  if (result.ok) redirect(`${path(orgId, '/kiosks')}?pair=${kioskId}&new=1`);
  return result;
}

export async function disableKioskAction(orgId: string, kioskId: string, _: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const platform = await requirePlatform('platform.org.manage');
    const ctx = await orgContextForPlatform(platform, orgId);
    const { reason } = DisableInput.parse(formObject(form));
    await setKioskEnabled(ctx, kioskId, false, reason);
    revalidatePath(path(orgId), 'layout');
    return { ok: true, message: 'ปิดการใช้งานแล้ว ตู้จะหยุดรับลูกค้าภายใน 1 นาที' };
  });
}

export async function enableKioskAction(orgId: string, kioskId: string, _: ActionState): Promise<ActionState> {
  return runAction(async () => {
    const platform = await requirePlatform('platform.org.manage');
    const ctx = await orgContextForPlatform(platform, orgId);
    await setKioskEnabled(ctx, kioskId, true);
    revalidatePath(path(orgId), 'layout');
    return { ok: true, message: 'เปิดการใช้งานแล้ว' };
  });
}

export async function unpairKioskPlatformAction(orgId: string, kioskId: string, _: ActionState): Promise<ActionState> {
  return runAction(async () => {
    const platform = await requirePlatform('platform.org.manage');
    const ctx = await orgContextForPlatform(platform, orgId);
    await unpairKiosk(ctx, kioskId);
    revalidatePath(path(orgId), 'layout');
    return { ok: true, message: 'ยกเลิกการเชื่อมต่อแล้ว' };
  });
}

export async function addUserAction(orgId: string, _: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const platform = await requirePlatform('platform.org.manage');
    const ctx = await orgContextForPlatform(platform, orgId);
    const input = MemberInput.parse({ ...formObject(form), allBranches: true, branchIds: [] });
    const { tempPassword } = await addMember(ctx, input);
    revalidatePath(path(orgId), 'layout');
    return tempPassword
      ? { ok: true, tempPassword, tempPasswordFor: input.email }
      : { ok: true, message: `เพิ่ม ${input.email} แล้ว (ใช้บัญชีเดิมที่มีอยู่เข้าสู่ระบบได้เลย)` };
  });
}

export async function resetUserPasswordAction(orgId: string, userId: string, email: string, _: ActionState): Promise<ActionState> {
  return runAction(async () => {
    const platform = await requirePlatform('platform.org.manage');
    const ctx = await orgContextForPlatform(platform, orgId);
    const tempPassword = await resetMemberPassword(ctx, userId);
    return { ok: true, tempPassword, tempPasswordFor: email };
  });
}

export async function removeUserAction(orgId: string, userId: string, _: ActionState): Promise<ActionState> {
  return runAction(async () => {
    const platform = await requirePlatform('platform.org.manage');
    const ctx = await orgContextForPlatform(platform, orgId);
    await removeMember(ctx, userId);
    revalidatePath(path(orgId), 'layout');
    return { ok: true, message: 'ลบออกจากบัญชีแล้ว' };
  });
}
