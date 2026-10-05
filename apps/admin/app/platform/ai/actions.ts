'use server';

import { revalidatePath } from 'next/cache';
import { requirePlatform } from '@/server/auth/context';
import { AiSettingsInput, saveAiSettings, testAiSettings } from '@/server/services/ai-settings';
import { formObject, runAction, type ActionState } from '@/server/lib/action';

export async function saveAiSettingsAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requirePlatform('platform.secrets');
    await saveAiSettings(ctx, AiSettingsInput.parse(formObject(form, { booleans: ['faceRefine'], arrays: ['clearKeys'] })));
    revalidatePath('/platform/ai');
    return { ok: true, message: 'บันทึกการตั้งค่า AI แล้ว ตู้ทุกเครื่องใช้ค่าใหม่ตั้งแต่ภาพถัดไป' };
  });
}

export async function testAiSettingsAction(_: ActionState): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requirePlatform('platform.secrets');
    const r = await testAiSettings(ctx);
    revalidatePath('/platform/ai');
    return { ok: r.ok, message: r.ok ? `ใช้งานได้ • ${r.message}` : `ทดสอบไม่ผ่าน • ${r.message}` };
  });
}
