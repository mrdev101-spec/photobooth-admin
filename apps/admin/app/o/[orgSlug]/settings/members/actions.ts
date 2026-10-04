'use server';

import { revalidatePath } from 'next/cache';
import { getOrgContext } from '@/server/auth/context';
import { MemberInput, MemberUpdateInput, addMember, removeMember, resetMemberPassword, updateMember } from '@/server/services/members';
import { formObject, runAction, type ActionState } from '@/server/lib/action';

const memberForm = (form: FormData) => formObject(form, { booleans: ['allBranches'], arrays: ['branchIds'] });

export async function addMemberAction(orgSlug: string, _: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await getOrgContext(orgSlug);
    const input = MemberInput.parse(memberForm(form));
    const { tempPassword } = await addMember(ctx, input);
    revalidatePath(`/o/${orgSlug}/settings/members`);
    return tempPassword
      ? { ok: true, tempPassword, tempPasswordFor: input.email }
      : { ok: true, message: `เพิ่ม ${input.email} แล้ว (ใช้บัญชีเดิมที่มีอยู่เข้าสู่ระบบได้เลย)` };
  });
}

export async function updateMemberAction(orgSlug: string, userId: string, _: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await getOrgContext(orgSlug);
    await updateMember(ctx, userId, MemberUpdateInput.parse(memberForm(form)));
    revalidatePath(`/o/${orgSlug}/settings/members`);
    return { ok: true, message: 'บันทึกแล้ว' };
  });
}

export async function removeMemberAction(orgSlug: string, userId: string, _: ActionState): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await getOrgContext(orgSlug);
    await removeMember(ctx, userId);
    revalidatePath(`/o/${orgSlug}/settings/members`);
    return { ok: true, message: 'ลบออกจากบัญชีแล้ว' };
  });
}

export async function resetPasswordAction(orgSlug: string, userId: string, email: string, _: ActionState): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await getOrgContext(orgSlug);
    const tempPassword = await resetMemberPassword(ctx, userId);
    return { ok: true, tempPassword, tempPasswordFor: email };
  });
}
