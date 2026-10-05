'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getOrgContext } from '@/server/auth/context';
import { EventInfoInput, SavePresetInput, createEvent, saveDefaults, saveEventSettings, setEventActive, updateEventInfo } from '@/server/services/config-presets';
import { orgDefaults } from '@/server/services/config-sources';
import { followLayer } from '@/server/services/quick-settings';
import { AppError } from '@/server/lib/errors';
import type { ConfigSectionId } from '@/lib/config-permissions';
import { formObject, runAction, type ActionState } from '@/server/lib/action';
import { configEvents } from '@/server/db/schema';
import { db } from '@/server/db/client';
import { eq } from 'drizzle-orm';
import type { SaveConfigResult } from '../kiosks/[id]/config/actions';

const kioskMessage = (n: number) => (n ? ` • ส่งค่าใหม่ไป ${n} ตู้ (ใช้เมื่อตู้กลับหน้าแรก)` : '');

export async function saveDefaultsAction(orgSlug: string, payload: unknown): Promise<SaveConfigResult> {
  let updatedAt: string | undefined;
  const r = await runAction(async () => {
    const ctx = await getOrgContext(orgSlug);
    const res = await saveDefaults(ctx, SavePresetInput.parse(payload));
    updatedAt = (await orgDefaults(ctx.org.id)).updatedAt?.toISOString();
    revalidatePath(`/o/${orgSlug}`, 'layout');
    return { ok: true, message: res.changed ? `บันทึกค่ากลางแล้ว${kioskMessage(res.kiosks)}` : 'ไม่มีการเปลี่ยนแปลง' };
  });
  return { ...r, updatedAt };
}

export async function saveEventSettingsAction(orgSlug: string, id: string, payload: unknown): Promise<SaveConfigResult> {
  let updatedAt: string | undefined;
  const r = await runAction(async () => {
    const ctx = await getOrgContext(orgSlug);
    const res = await saveEventSettings(ctx, id, SavePresetInput.parse(payload));
    const row = (await db().select({ updatedAt: configEvents.updatedAt }).from(configEvents).where(eq(configEvents.id, id)).limit(1))[0];
    updatedAt = row?.updatedAt.toISOString();
    revalidatePath(`/o/${orgSlug}`, 'layout');
    return { ok: true, message: res.changed ? `บันทึกงานแล้ว${kioskMessage(res.kiosks)}` : 'ไม่มีการเปลี่ยนแปลง' };
  });
  return { ...r, updatedAt };
}

export async function createEventAction(orgSlug: string, _: ActionState, form: FormData): Promise<ActionState> {
  let id = '';
  const r = await runAction(async () => {
    const ctx = await getOrgContext(orgSlug);
    id = await createEvent(ctx, EventInfoInput.parse(formObject(form)));
    return { ok: true };
  });
  if (r.ok && id) redirect(`/o/${orgSlug}/events/${id}`);
  return r;
}

export async function updateEventInfoAction(orgSlug: string, id: string, _: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await getOrgContext(orgSlug);
    await updateEventInfo(ctx, id, EventInfoInput.parse(formObject(form)));
    revalidatePath(`/o/${orgSlug}`, 'layout');
    return { ok: true, message: 'บันทึกแล้ว' };
  });
}

export async function setEventActiveAction(orgSlug: string, id: string, isActive: boolean, _: ActionState): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await getOrgContext(orgSlug);
    const n = await setEventActive(ctx, id, isActive);
    revalidatePath(`/o/${orgSlug}`, 'layout');
    return { ok: true, message: `${isActive ? 'เปิดงานแล้ว' : 'ปิดงานแล้ว ตู้ในงานกลับไปใช้ค่ากลาง'}${kioskMessage(n)}` };
  });
}

/** ค่ากลาง / งาน: the kiosks that set a section themselves follow this layer again for it. */
export async function followLayerAction(orgSlug: string, eventId: string | null, section: string): Promise<{ ok: boolean; message: string }> {
  try {
    const ctx = await getOrgContext(orgSlug);
    const n = await followLayer(ctx, eventId, section as ConfigSectionId);
    revalidatePath(`/o/${orgSlug}/events`, 'layout');
    return { ok: true, message: `${n} ตู้กลับมาใช้ค่า${eventId ? 'ของงาน' : 'กลาง'}แล้ว (ส่งไปตู้แล้ว)` };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, message: err.message };
    console.error(err);
    return { ok: false, message: 'ทำไม่สำเร็จ ลองใหม่อีกครั้ง' };
  }
}
