'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createSession } from '@/server/auth/session';
import { resendChallenge, verifyChallenge } from '@/server/auth/two-factor';
import { runAction, type ActionState } from '@/server/lib/action';

const CodeInput = z.object({ code: z.string().trim().regex(/^\d{6}$/, 'กรอกรหัส 6 หลักจากอีเมล') });

export async function verifyCodeAction(_: ActionState, form: FormData): Promise<ActionState> {
  const result = await runAction(async () => {
    const { code } = CodeInput.parse({ code: form.get('code') });
    const userId = await verifyChallenge(code, form.get('remember') === 'on');
    await createSession(userId);
    return { ok: true };
  });
  if (result.ok) redirect('/');
  return result;
}

export async function resendCodeAction(_: ActionState): Promise<ActionState> {
  return runAction(async () => {
    await resendChallenge();
    return { ok: true, message: 'ส่งรหัสใหม่ไปที่อีเมลแล้ว' };
  });
}
