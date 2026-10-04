'use server';

import { revalidatePath } from 'next/cache';
import { requirePlatform } from '@/server/auth/context';
import {
  NewOrganizationInput,
  OrganizationInfoInput,
  createOrganization,
  setLivePaymentsAllowed,
  setOrganizationStatus,
  updateOrganization
} from '@/server/services/organizations';
import { StorageInput, saveStorage, testStorage } from '@/server/services/storage';
import { formObject, runAction, type ActionState } from '@/server/lib/action';

export async function createOrganizationAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requirePlatform('platform.org.manage');
    const input = NewOrganizationInput.parse(formObject(form));
    const result = await createOrganization(ctx, input);
    revalidatePath('/platform/organizations');
    return {
      ok: true,
      message: result.ownerTempPassword ? undefined : `สร้างบัญชี "${input.name}" แล้ว เจ้าของใช้บัญชีเดิมที่มีอยู่เข้าสู่ระบบได้เลย`,
      tempPassword: result.ownerTempPassword ?? undefined,
      tempPasswordFor: input.ownerEmail
    };
  });
}

export async function updateOrganizationAction(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requirePlatform('platform.org.manage');
    await updateOrganization(ctx, id, OrganizationInfoInput.parse(formObject(form)));
    revalidatePath(`/platform/organizations/${id}`);
    return { ok: true, message: 'บันทึกแล้ว' };
  });
}

export async function setOrganizationStatusAction(id: string, status: 'active' | 'suspended', _: ActionState): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requirePlatform('platform.org.manage');
    await setOrganizationStatus(ctx, id, status);
    revalidatePath(`/platform/organizations/${id}`);
    return { ok: true, message: status === 'suspended' ? 'ระงับบัญชีแล้ว' : 'เปิดใช้งานแล้ว' };
  });
}

export async function setLivePaymentsAction(id: string, allowed: boolean, _: ActionState): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requirePlatform('platform.org.manage');
    await setLivePaymentsAllowed(ctx, id, allowed);
    revalidatePath(`/platform/organizations/${id}`);
    return { ok: true, message: allowed ? 'อนุญาตให้รับเงินจริงแล้ว' : 'ปิดการรับเงินจริงแล้ว' };
  });
}

export async function saveStorageAction(orgId: string, _: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requirePlatform('platform.org.manage');
    const { kiosksUpdated } = await saveStorage(ctx, orgId, StorageInput.parse(formObject(form)));
    revalidatePath(`/platform/organizations/${orgId}`);
    return { ok: true, message: kiosksUpdated ? `บันทึกแล้ว ส่งค่าใหม่ให้ตู้ ${kiosksUpdated} เครื่อง` : 'บันทึกแล้ว' };
  });
}

export async function testStorageAction(orgId: string, _: ActionState): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requirePlatform('platform.org.manage');
    const r = await testStorage(ctx, orgId);
    revalidatePath(`/platform/organizations/${orgId}`);
    return r.ok ? { ok: true, message: 'เขียน อ่าน และลบไฟล์ทดสอบได้' } : { ok: false, message: r.error };
  });
}
