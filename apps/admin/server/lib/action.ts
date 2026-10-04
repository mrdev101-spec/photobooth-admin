import 'server-only';
import { unstable_rethrow } from 'next/navigation';
import { z } from 'zod';
import type { ActionState } from '@/lib/action-state';
import { AppError } from './errors';

export type { ActionState };

export function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    out[key] ??= issue.message;
  }
  return out;
}

/** Runs an action body, turning validation and AppErrors into form state. */
export async function runAction(body: () => Promise<ActionState>): Promise<ActionState> {
  try {
    return await body();
  } catch (err) {
    unstable_rethrow(err); // let redirect()/notFound() through
    if (err instanceof z.ZodError) return { ok: false, message: 'ข้อมูลไม่ถูกต้อง', fieldErrors: fieldErrorsOf(err) };
    if (err instanceof AppError) return { ok: false, message: err.message, fieldErrors: err.fieldErrors };
    console.error(err);
    return { ok: false, message: 'เกิดข้อผิดพลาด กรุณาลองใหม่' };
  }
}

/** FormData → plain object; checkboxes named in `booleans` become true/false, `arrays` keep every value. */
export function formObject(form: FormData, opts: { booleans?: string[]; arrays?: string[] } = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of form.entries()) {
    if (key.startsWith('$ACTION')) continue;
    if (opts.arrays?.includes(key)) continue;
    out[key] = typeof value === 'string' ? value : '';
  }
  for (const key of opts.booleans ?? []) out[key] = form.get(key) === 'on' || form.get(key) === 'true';
  for (const key of opts.arrays ?? []) out[key] = form.getAll(key).filter((v): v is string => typeof v === 'string');
  return out;
}
