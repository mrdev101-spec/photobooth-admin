'use server';

import { revalidatePath } from 'next/cache';
import { getOrgContext } from '@/server/auth/context';
import { allowReprint } from '@/server/services/orders';
import { sendOrderCommand } from '@/server/services/kiosk-commands';
import { runAction, type ActionState } from '@/server/lib/action';

export async function allowReprintAction(orgSlug: string, orderId: string, _: ActionState): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await getOrgContext(orgSlug);
    await allowReprint(ctx, orderId);
    revalidatePath(`/o/${orgSlug}/orders/${orderId}`);
    return { ok: true, message: 'อนุญาตพิมพ์ซ้ำ 1 ครั้งแล้ว จุดรับรูปพิมพ์ได้ทันที' };
  });
}

/** Event Console: reprint at the kiosk / cancel what is still in its printer queue. */
export async function orderCommandAction(orgSlug: string, orderId: string, type: 'reprint' | 'cancel_print', _: ActionState): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await getOrgContext(orgSlug);
    const r = await sendOrderCommand(ctx, orderId, type === 'cancel_print' ? 'cancel_print' : 'reprint');
    revalidatePath(`/o/${orgSlug}/orders/${orderId}`);
    return { ok: true, message: `ส่งคำสั่ง${r.label}ไปที่ตู้แล้ว` };
  });
}
