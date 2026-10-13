'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getOrgContext } from '@/server/auth/context';
import {
  KioskInput,
  acceptFingerprint,
  archiveKiosk,
  createKiosk,
  createPairCode,
  deletePendingKiosk,
  kioskPairState,
  restoreKiosk,
  setMaintenance,
  unpairKiosk,
  updateKiosk
} from '@/server/services/kiosks';
import { AppError } from '@/server/lib/errors';
import { setKioskMode } from '@/server/services/quick-settings';
import { formObject, runAction, type ActionState } from '@/server/lib/action';

export async function createKioskAction(orgSlug: string, _: ActionState, form: FormData): Promise<ActionState> {
  let id = '';
  const result = await runAction(async () => {
    const ctx = await getOrgContext(orgSlug);
    id = await createKiosk(ctx, KioskInput.parse(formObject(form)));
    return { ok: true };
  });
  if (result.ok) redirect(`/o/${orgSlug}/kiosks/${id}?pair=1`);
  return result;
}

export async function updateKioskAction(orgSlug: string, id: string, _: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await getOrgContext(orgSlug);
    await updateKiosk(ctx, id, KioskInput.parse(formObject(form)));
    revalidatePath(`/o/${orgSlug}/kiosks`);
    return { ok: true, message: 'บันทึกแล้ว' };
  });
}

/** Called directly from the pairing panel (not a form). */
export async function createPairCodeAction(orgSlug: string, id: string, kind: 'pair' | 'key' = 'pair'): Promise<{ code?: string; expiresAt?: string; error?: string }> {
  try {
    const ctx = await getOrgContext(orgSlug);
    const { code, expiresAt } = await createPairCode(ctx, id, kind === 'key' ? 'key' : 'pair');
    return { code, expiresAt: expiresAt.toISOString() };
  } catch (err) {
    if (err instanceof AppError) return { error: err.message };
    throw err;
  }
}

export async function pairStateAction(orgSlug: string, id: string) {
  const ctx = await getOrgContext(orgSlug);
  return kioskPairState(ctx, id);
}

export async function unpairKioskAction(orgSlug: string, id: string, _: ActionState): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await getOrgContext(orgSlug);
    await unpairKiosk(ctx, id);
    revalidatePath(`/o/${orgSlug}/kiosks/${id}`);
    return { ok: true, message: 'ยกเลิกการเชื่อมต่อแล้ว' };
  });
}

export async function acceptFingerprintAction(orgSlug: string, id: string, _: ActionState): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await getOrgContext(orgSlug);
    await acceptFingerprint(ctx, id);
    revalidatePath(`/o/${orgSlug}/kiosks/${id}`);
    return { ok: true, message: 'ยอมรับเครื่องใหม่แล้ว' };
  });
}

export async function setMaintenanceAction(orgSlug: string, id: string, on: boolean, _: ActionState): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await getOrgContext(orgSlug);
    await setMaintenance(ctx, id, on);
    revalidatePath(`/o/${orgSlug}/kiosks/${id}`);
    return { ok: true, message: on ? 'ตู้จะแสดงหน้าปิดปรับปรุงเมื่อกลับหน้าแรก' : 'ตู้กลับมารับลูกค้าแล้ว' };
  });
}

export async function deleteKioskAction(orgSlug: string, id: string, _: ActionState): Promise<ActionState> {
  const result = await runAction(async () => {
    const ctx = await getOrgContext(orgSlug);
    await deletePendingKiosk(ctx, id);
    return { ok: true };
  });
  if (result.ok) redirect(`/o/${orgSlug}/kiosks`);
  return result;
}

/** Kiosk list / overview: switch this kiosk's mode (sets the mode on this kiosk only). */
export async function setKioskModeAction(orgSlug: string, kioskRowId: string, mode: string, target: 'source' | 'kiosk' = 'kiosk'): Promise<{ ok: boolean; message: string }> {
  try {
    const ctx = await getOrgContext(orgSlug);
    const r = await setKioskMode(ctx, kioskRowId, mode, target === 'source' ? 'source' : 'kiosk');
    revalidatePath(`/o/${orgSlug}/kiosks`, 'layout');
    return { ok: true, message: r.source ? `เปลี่ยนที่${r.source.label}แล้ว (${r.source.kiosks} ตู้) • เปลี่ยนเมื่อกลับหน้าแรก` : 'ส่งไปตู้แล้ว (เฉพาะตู้นี้) • เปลี่ยนเมื่อกลับหน้าแรก' };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, message: err.message };
    console.error(err);
    return { ok: false, message: 'เปลี่ยนโหมดไม่สำเร็จ' };
  }
}

/** "ยกเลิกตู้": unpaired for good and moved to the kiosk history (nothing is deleted). */
export async function archiveKioskAction(orgSlug: string, id: string, _: ActionState, form: FormData): Promise<ActionState> {
  const result = await runAction(async () => {
    const ctx = await getOrgContext(orgSlug);
    await archiveKiosk(ctx, id, String(form.get('reason') ?? ''));
    revalidatePath(`/o/${orgSlug}/kiosks`);
    return { ok: true };
  });
  if (result.ok) redirect(`/o/${orgSlug}/kiosks/history?archived=${id}`);
  return result;
}

/** Back from the history: in the kiosk list again, waiting for a new pairing code. */
export async function restoreKioskAction(orgSlug: string, id: string, _: ActionState): Promise<ActionState> {
  const result = await runAction(async () => {
    const ctx = await getOrgContext(orgSlug);
    await restoreKiosk(ctx, id);
    revalidatePath(`/o/${orgSlug}/kiosks`);
    return { ok: true };
  });
  if (result.ok) redirect(`/o/${orgSlug}/kiosks/${id}`);
  return result;
}
