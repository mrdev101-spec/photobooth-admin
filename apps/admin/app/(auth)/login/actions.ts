'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { authenticate } from '@/server/services/accounts';
import { createSession } from '@/server/auth/session';
import { runAction, type ActionState } from '@/server/lib/action';

const LoginInput = z.object({
  email: z.string().trim().min(1, 'กรอกอีเมล').max(254),
  password: z.string().min(1, 'กรอกรหัสผ่าน').max(200)
});

export async function loginAction(_: ActionState, form: FormData): Promise<ActionState> {
  const result = await runAction(async () => {
    const input = LoginInput.parse({ email: form.get('email'), password: form.get('password') });
    const userId = await authenticate(input.email, input.password);
    await createSession(userId);
    return { ok: true };
  });
  if (result.ok) redirect('/');
  return result;
}
