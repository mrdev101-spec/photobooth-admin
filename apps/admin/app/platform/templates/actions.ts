'use server';

import { revalidatePath } from 'next/cache';
import { requirePlatform } from '@/server/auth/context';
import { setTemplateStatus } from '@/server/services/catalog';
import { runAction, type ActionState } from '@/server/lib/action';
import { AppError } from '@/server/lib/errors';
import { TEMPLATE_KINDS, type TemplateKind } from '@/lib/template-visibility';

export async function setTemplateStatusAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requirePlatform('platform.catalog');
    const kind = String(form.get('kind')) as TemplateKind;
    const id = String(form.get('id'));
    const status = form.get('status') === 'retired' ? 'retired' : 'published';
    if (!TEMPLATE_KINDS.some((k) => k.kind === kind)) throw new AppError('หมวดไม่ถูกต้อง');
    const bumped = await setTemplateStatus(ctx, kind, id, status);
    revalidatePath('/platform/templates');
    return { ok: true, message: `${status === 'retired' ? 'เลิกใช้' : 'เปิดใช้'}แล้ว ส่งการตั้งค่าใหม่ไป ${bumped} ตู้` };
  });
}
