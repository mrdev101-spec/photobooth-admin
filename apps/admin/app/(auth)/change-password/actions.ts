'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireUser } from '@/server/auth/context';
import { createSession } from '@/server/auth/session';
import { changeOwnPassword } from '@/server/services/accounts';
import { runAction, type ActionState } from '@/server/lib/action';

const Input = z
  .object({
    current: z.string().min(1, 'กรอกรหัสผ่านปัจจุบัน'),
    next: z.string().min(1, 'กรอกรหัสผ่านใหม่'),
    confirm: z.string()
  })
  .refine((v) => v.next === v.confirm, { path: ['confirm'], message: 'รหัสผ่านใหม่ไม่ตรงกัน' });

export async function changePasswordAction(_: ActionState, form: FormData): Promise<ActionState> {
  const result = await runAction(async () => {
    const user = await requireUser({ allowPasswordChange: true });
    const input = Input.parse({ current: form.get('current'), next: form.get('next'), confirm: form.get('confirm') });
    await changeOwnPassword(user.id, input.current, input.next);
    // Every session was revoked; sign this browser back in
    await createSession(user.id);
    return { ok: true };
  });
  if (result.ok) redirect('/');
  return result;
}
