'use server';

import { revalidatePath } from 'next/cache';
import { getOrgContext } from '@/server/auth/context';
import { SaveConfigInput, rollbackKioskConfig, saveKioskConfig } from '@/server/services/kiosk-config';
import { runAction, type ActionState } from '@/server/lib/action';

export type SaveConfigResult = ActionState & { revision?: number };

/** Called directly by the config editor with the whole settings document. */
export async function saveConfigAction(orgSlug: string, kioskRowId: string, payload: unknown): Promise<SaveConfigResult> {
  let revision: number | undefined;
  const result = await runAction(async () => {
    const ctx = await getOrgContext(orgSlug);
    const r = await saveKioskConfig(ctx, kioskRowId, SaveConfigInput.parse(payload));
    revision = r.revision;
    revalidatePath(`/o/${orgSlug}/kiosks/${kioskRowId}`, 'layout');
    return { ok: true, message: r.changed ? `บันทึกแล้ว (revision ${r.revision}) ตู้จะใช้ค่าใหม่เมื่อกลับหน้าแรก` : 'ไม่มีการเปลี่ยนแปลง' };
  });
  return { ...result, revision };
}

export async function rollbackAction(orgSlug: string, kioskRowId: string, toRevision: number, baseRevision: number, _: ActionState): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await getOrgContext(orgSlug);
    const revision = await rollbackKioskConfig(ctx, kioskRowId, toRevision, baseRevision);
    revalidatePath(`/o/${orgSlug}/kiosks/${kioskRowId}`, 'layout');
    return { ok: true, message: `ย้อนกลับแล้ว เป็น revision ${revision}` };
  });
}
