'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { UPLOADED_TEMPLATE_KINDS, type UploadedTemplateKind } from '@photobooth/contracts';
import { requirePlatform } from '@/server/auth/context';
import { formObject, runAction, type ActionState } from '@/server/lib/action';
import { AppError } from '@/server/lib/errors';
import {
  NewTemplateInput,
  TemplateInfoInput,
  createTemplate,
  discardDraft,
  publishDraft,
  removeDraftFile,
  rollbackTo,
  saveDraft,
  updateTemplateInfo,
  uploadDraftFile,
  type FileSlot
} from '@/server/services/template-studio';

type Result = { ok: true; message?: string } | { ok: false; message: string };

const FILE_SLOTS: FileSlot[] = ['overlay', 'sample', 'plate', 'female', 'male'];

function kindOf(v: unknown): UploadedTemplateKind {
  if (!UPLOADED_TEMPLATE_KINDS.includes(v as UploadedTemplateKind)) throw new AppError('หมวดไม่ถูกต้อง');
  return v as UploadedTemplateKind;
}

async function run(body: () => Promise<string | void>): Promise<Result> {
  try {
    const message = await body();
    return { ok: true, message: message || undefined };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, message: err.message };
    if (err instanceof z.ZodError) return { ok: false, message: err.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง' };
    console.error(err);
    return { ok: false, message: 'เกิดข้อผิดพลาด กรุณาลองใหม่' };
  }
}

const touched = (kind: string, id: string) => {
  revalidatePath('/platform/templates');
  revalidatePath(`/platform/templates/${kind}/${id}`);
};

export async function createTemplateAction(_: ActionState, form: FormData): Promise<ActionState> {
  let target = '';
  const state = await runAction(async () => {
    const ctx = await requirePlatform('platform.catalog');
    const input = NewTemplateInput.parse(formObject(form));
    const id = await createTemplate(ctx, input);
    target = `/platform/templates/${input.kind}/${id}/edit`;
    return { ok: true };
  });
  if (state.ok && target) redirect(target);
  return state;
}

export async function updateInfoAction(kind: string, id: string, _: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requirePlatform('platform.catalog');
    await updateTemplateInfo(ctx, kindOf(kind), id, TemplateInfoInput.parse(formObject(form)));
    touched(kind, id);
    return { ok: true, message: 'บันทึกข้อมูลแล้ว' };
  });
}

/** Editor save: slot file (JSON) + the preview the browser rendered from it. */
export async function saveDraftAction(kind: string, id: string, form: FormData): Promise<Result> {
  return run(async () => {
    const ctx = await requirePlatform('platform.catalog');
    let spec: unknown;
    try {
      spec = JSON.parse(String(form.get('spec') ?? ''));
    } catch {
      throw new AppError('ข้อมูลช่องไม่ถูกต้อง');
    }
    const preview = form.get('preview');
    const version = await saveDraft(ctx, kindOf(kind), id, {
      spec,
      note: String(form.get('note') ?? ''),
      preview: preview instanceof File && preview.size ? new Uint8Array(await preview.arrayBuffer()) : null
    });
    touched(kind, id);
    return `บันทึกร่างเวอร์ชัน ${version} แล้ว`;
  });
}

export async function uploadFileAction(kind: string, id: string, form: FormData): Promise<Result> {
  return run(async () => {
    const ctx = await requirePlatform('platform.catalog');
    const slot = String(form.get('slot')) as FileSlot;
    if (!FILE_SLOTS.includes(slot)) throw new AppError('ชนิดไฟล์ไม่ถูกต้อง');
    const file = form.get('file');
    if (!(file instanceof File) || !file.size) throw new AppError('ยังไม่ได้เลือกไฟล์');
    await uploadDraftFile(ctx, kindOf(kind), id, slot, new Uint8Array(await file.arrayBuffer()));
    touched(kind, id);
    return 'อัปโหลดแล้ว';
  });
}

export async function removeFileAction(kind: string, id: string, slot: string): Promise<Result> {
  return run(async () => {
    const ctx = await requirePlatform('platform.catalog');
    if (!FILE_SLOTS.includes(slot as FileSlot)) throw new AppError('ชนิดไฟล์ไม่ถูกต้อง');
    await removeDraftFile(ctx, kindOf(kind), id, slot as FileSlot);
    touched(kind, id);
  });
}

export async function publishDraftAction(kind: string, id: string): Promise<Result> {
  return run(async () => {
    const ctx = await requirePlatform('platform.catalog');
    const r = await publishDraft(ctx, kindOf(kind), id);
    touched(kind, id);
    return `เผยแพร่เวอร์ชัน ${r.version} แล้ว ตู้จะดาวน์โหลดเมื่อเช็กรายการ template ครั้งถัดไป`;
  });
}

export async function rollbackAction(kind: string, id: string, version: number): Promise<Result> {
  return run(async () => {
    const ctx = await requirePlatform('platform.catalog');
    await rollbackTo(ctx, kindOf(kind), id, version);
    touched(kind, id);
    return `กลับไปใช้เวอร์ชัน ${version} แล้ว`;
  });
}

export async function discardDraftAction(kind: string, id: string): Promise<Result> {
  return run(async () => {
    const ctx = await requirePlatform('platform.catalog');
    await discardDraft(ctx, kindOf(kind), id);
    touched(kind, id);
    return 'ยกเลิกร่างแล้ว';
  });
}
