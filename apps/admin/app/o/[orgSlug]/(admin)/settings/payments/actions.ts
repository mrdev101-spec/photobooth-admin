'use server';

import { revalidatePath } from 'next/cache';
import { requireOrg } from '@/server/auth/context';
import { OrgPaymentInput, saveOrgPayment, testOrgPayment } from '@/server/services/payment-accounts';
import { formObject, runAction, type ActionState } from '@/server/lib/action';

export async function saveOrgPaymentAction(orgSlug: string, _: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireOrg(orgSlug, 'org.settings');
    const input = OrgPaymentInput.parse(formObject(form, { booleans: ['active'], arrays: ['clearKeys'] }));
    await saveOrgPayment(ctx, input);
    revalidatePath(`/o/${orgSlug}/settings/payments`);
    return { ok: true, message: input.active ? 'บันทึกแล้ว รายการใหม่ของตู้จะเข้าบัญชี Stripe ของร้าน' : 'บันทึกแล้ว ตอนนี้รับเงินเข้าบัญชีกลางของผู้ให้บริการ' };
  });
}

export async function testOrgPaymentAction(orgSlug: string, mode: 'test' | 'live', _: ActionState): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireOrg(orgSlug, 'org.settings');
    const r = await testOrgPayment(ctx, mode);
    revalidatePath(`/o/${orgSlug}/settings/payments`);
    return { ok: r.ok, message: r.message };
  });
}
