'use server';

import { revalidatePath } from 'next/cache';
import { requirePlatform } from '@/server/auth/context';
import { PaymentKeysInput, savePlatformPayment, testPlatformPayment } from '@/server/services/payment-accounts';
import { formObject, runAction, type ActionState } from '@/server/lib/action';

export async function savePlatformPaymentAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requirePlatform('platform.secrets');
    await savePlatformPayment(ctx, PaymentKeysInput.parse(formObject(form, { arrays: ['clearKeys'] })));
    revalidatePath('/platform/payments');
    return { ok: true, message: 'บันทึกบัญชีรับเงินกลางแล้ว ตู้ใช้ค่าใหม่ตั้งแต่รายการถัดไป' };
  });
}

export async function testPlatformPaymentAction(mode: 'test' | 'live', _: ActionState): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requirePlatform('platform.secrets');
    const r = await testPlatformPayment(ctx, mode);
    revalidatePath('/platform/payments');
    return { ok: r.ok, message: r.message };
  });
}
