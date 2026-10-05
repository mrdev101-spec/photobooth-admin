'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireOrg } from '@/server/auth/context';
import { formObject, runAction, type ActionState } from '@/server/lib/action';
import { AppError } from '@/server/lib/errors';
import {
  NewTemplateInput,
  SHOP_TEMPLATE_KINDS,
  TemplateInfoInput,
  createTemplate,
  discardDraft,
  publishDraft,
  removeDraftFile,
  saveDraft,
  setOwnTemplateStatus,
  updateTemplateInfo,
  uploadDraftFile,
  type FileSlot,
  type StudioActor
} from '@/server/services/template-studio';

/** A customer's own templates (frames for its kiosks only): the platform studio's actions, scoped. */

type Result = { ok: true; message?: string } | { ok: false; message: string };
type ShopKind = (typeof SHOP_TEMPLATE_KINDS)[number];
const FILE_SLOTS: FileSlot[] = ['overlay', 'sample'];

async function actor(orgSlug: string): Promise<StudioActor> {
  const ctx = await requireOrg(orgSlug, 'template.manage');
  return { user: ctx.user, orgId: ctx.org.id, actingAsPlatform: ctx.actingAsPlatform };
}

function kindOf(v: unknown): ShopKind {
  if (!(SHOP_TEMPLATE_KINDS as readonly string[]).includes(String(v))) throw new AppError('ร้านอัปโหลดได้เฉพาะกรอบภาพ 4x6 และกรอบเข็มกลัด');
  return v as ShopKind;
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

const touched = (orgSlug: string, kind?: string, id?: string) => {
  revalidatePath(`/o/${orgSlug}/templates`);
  if (kind && id) revalidatePath(`/o/${orgSlug}/templates/${kind}/${id}/edit`);
};

export async function createShopTemplateAction(orgSlug: string, _: ActionState, form: FormData): Promise<ActionState> {
  let target = '';
  const state = await runAction(async () => {
    const ctx = await actor(orgSlug);
    // Customers name their template; the id is generated (no slug field)
    const input = NewTemplateInput.parse({ ...formObject(form), slug: 'shop' });
    const id = await createTemplate(ctx, { ...input, kind: kindOf(input.kind) });
    target = `/o/${orgSlug}/templates/${input.kind}/${id}/edit`;
    return { ok: true };
  });
  if (state.ok && target) redirect(target);
  return state;
}

export async function updateShopInfoAction(orgSlug: string, kind: string, id: string, _: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    await updateTemplateInfo(await actor(orgSlug), kindOf(kind), id, TemplateInfoInput.parse(formObject(form)));
    touched(orgSlug, kind, id);
    return { ok: true, message: 'บันทึกข้อมูลแล้ว' };
  });
}

export async function saveShopDraftAction(orgSlug: string, kind: string, id: string, form: FormData): Promise<Result> {
  return run(async () => {
    const ctx = await actor(orgSlug);
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
    touched(orgSlug, kind, id);
    return `บันทึกร่างเวอร์ชัน ${version} แล้ว`;
  });
}

export async function uploadShopFileAction(orgSlug: string, kind: string, id: string, form: FormData): Promise<Result> {
  return run(async () => {
    const ctx = await actor(orgSlug);
    const slot = String(form.get('slot')) as FileSlot;
    if (!FILE_SLOTS.includes(slot)) throw new AppError('ชนิดไฟล์ไม่ถูกต้อง');
    const file = form.get('file');
    if (!(file instanceof File) || !file.size) throw new AppError('ยังไม่ได้เลือกไฟล์');
    await uploadDraftFile(ctx, kindOf(kind), id, slot, new Uint8Array(await file.arrayBuffer()));
    touched(orgSlug, kind, id);
    return 'อัปโหลดแล้ว';
  });
}

export async function removeShopFileAction(orgSlug: string, kind: string, id: string, slot: string): Promise<Result> {
  return run(async () => {
    if (!FILE_SLOTS.includes(slot as FileSlot)) throw new AppError('ชนิดไฟล์ไม่ถูกต้อง');
    await removeDraftFile(await actor(orgSlug), kindOf(kind), id, slot as FileSlot);
    touched(orgSlug, kind, id);
  });
}

export async function publishShopDraftAction(orgSlug: string, kind: string, id: string): Promise<Result> {
  return run(async () => {
    const r = await publishDraft(await actor(orgSlug), kindOf(kind), id);
    touched(orgSlug, kind, id);
    return `เผยแพร่เวอร์ชัน ${r.version} แล้ว ตู้ของร้านได้ภายในไม่กี่วินาที (ตู้ที่ออนไลน์)`;
  });
}

export async function discardShopDraftAction(orgSlug: string, kind: string, id: string): Promise<Result> {
  return run(async () => {
    await discardDraft(await actor(orgSlug), kindOf(kind), id);
    touched(orgSlug, kind, id);
    return 'ยกเลิกร่างแล้ว';
  });
}

export async function setShopTemplateStatusAction(orgSlug: string, kind: string, id: string, status: 'published' | 'retired'): Promise<Result> {
  return run(async () => {
    const n = await setOwnTemplateStatus(await actor(orgSlug), kindOf(kind), id, status);
    touched(orgSlug, kind, id);
    return status === 'retired' ? `เลิกใช้แล้ว • ตู้ ${n} เครื่องได้รับค่าใหม่` : `เปิดใช้แล้ว • ตู้ ${n} เครื่องได้รับค่าใหม่`;
  });
}
