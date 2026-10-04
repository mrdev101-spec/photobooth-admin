'use server';

import { revalidatePath } from 'next/cache';
import { getOrgContext } from '@/server/auth/context';
import { allowReprint } from '@/server/services/orders';
import { runAction, type ActionState } from '@/server/lib/action';

export async function allowReprintAction(orgSlug: string, orderId: string, _: ActionState): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await getOrgContext(orgSlug);
    await allowReprint(ctx, orderId);
    revalidatePath(`/o/${orgSlug}/orders/${orderId}`);
    return { ok: true, message: 'อนุญาตพิมพ์ซ้ำ 1 ครั้งแล้ว จุดรับรูปพิมพ์ได้ทันที' };
  });
}
