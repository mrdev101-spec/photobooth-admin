'use server';

import { revalidatePath } from 'next/cache';
import { getOrgContext } from '@/server/auth/context';
import { BranchInput, createBranch, setBranchActive, updateBranch } from '@/server/services/branches';
import { formObject, runAction, type ActionState } from '@/server/lib/action';

export async function createBranchAction(orgSlug: string, _: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await getOrgContext(orgSlug);
    await createBranch(ctx, BranchInput.parse(formObject(form)));
    revalidatePath(`/o/${orgSlug}/settings/branches`);
    return { ok: true, message: 'เพิ่มสาขาแล้ว' };
  });
}

export async function updateBranchAction(orgSlug: string, id: string, _: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await getOrgContext(orgSlug);
    await updateBranch(ctx, id, BranchInput.parse(formObject(form)));
    revalidatePath(`/o/${orgSlug}/settings/branches`);
    return { ok: true, message: 'บันทึกแล้ว' };
  });
}

export async function setBranchActiveAction(orgSlug: string, id: string, isActive: boolean, _: ActionState): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await getOrgContext(orgSlug);
    await setBranchActive(ctx, id, isActive);
    revalidatePath(`/o/${orgSlug}/settings/branches`);
    return { ok: true };
  });
}
