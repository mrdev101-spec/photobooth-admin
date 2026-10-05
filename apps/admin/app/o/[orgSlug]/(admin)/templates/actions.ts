'use server';

import { revalidatePath } from 'next/cache';
import { getOrgContext } from '@/server/auth/context';
import { saveTemplateVisibility } from '@/server/services/catalog';
import { AppError } from '@/server/lib/errors';
import type { TemplateKind } from '@/lib/template-visibility';

const KINDS: TemplateKind[] = ['photo-4x6', 'badge', 'classic', 'ai-scene'];

export async function saveVisibilityAction(orgSlug: string, kioskRowIds: string[], kind: TemplateKind, ids: string[]): Promise<{ ok: boolean; message: string }> {
  try {
    if (!KINDS.includes(kind)) throw new AppError('หมวดไม่ถูกต้อง');
    const ctx = await getOrgContext(orgSlug);
    const r = await saveTemplateVisibility(ctx, kioskRowIds.slice(0, 500), kind, ids.slice(0, 500));
    revalidatePath(`/o/${orgSlug}/templates`);
    return { ok: true, message: r.changed ? `บันทึกแล้ว ส่งไป ${r.changed} ตู้ ตู้จะใช้เมื่อกลับหน้าแรก` : 'ไม่มีการเปลี่ยนแปลง' };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, message: err.message };
    console.error(err);
    return { ok: false, message: 'เกิดข้อผิดพลาด กรุณาลองใหม่' };
  }
}
