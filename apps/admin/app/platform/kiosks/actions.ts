'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { orgContextForPlatform, requirePlatform } from '@/server/auth/context';
import { DisableInput, KioskInput, archiveKiosk, createKiosk, getPlatformKiosk, restoreKiosk, setKioskEnabled, unpairKiosk } from '@/server/services/kiosks';
import { moveKiosk } from '@/server/services/kiosk-stock';
import { stockOrg } from '@/server/services/organizations';
import { db } from '@/server/db/client';
import { branches } from '@/server/db/schema';
import { AppError } from '@/server/lib/errors';
import { formObject, runAction, type ActionState } from '@/server/lib/action';

/** Platform kiosk pages: every action works on one kiosk, wherever it is (stock or a shop). */

const page = (id: string) => `/platform/kiosks/${id}`;

async function kioskCtx(id: string) {
  const platform = await requirePlatform('platform.org.manage');
  const row = await getPlatformKiosk(id);
  return { platform, row, ctx: await orgContextForPlatform(platform, row.org.id) };
}

async function stockBranch() {
  const stock = await stockOrg();
  const branch = (await db().select({ id: branches.id }).from(branches).where(eq(branches.orgId, stock.id)).limit(1))[0];
  if (!branch) throw new AppError('คลังตู้ยังไม่มีสาขา');
  return { stock, branchId: branch.id };
}

/** "orgId|branchId" from the shop + branch picker. */
function target(form: FormData) {
  const [orgId, branchId] = String(form.get('target') ?? '').split('|');
  if (!orgId || !branchId) throw new AppError('เลือกร้านและสาขา');
  return { orgId, branchId };
}

/** + เพิ่มตู้: into stock (to test first) or straight to a shop; then its page with the key. */
export async function createPlatformKioskAction(_: ActionState, form: FormData): Promise<ActionState> {
  let id = '';
  const result = await runAction(async () => {
    const platform = await requirePlatform('platform.org.manage');
    const dest = String(form.get('dest') ?? 'stock');
    const { orgId, branchId } = dest === 'stock' ? await stockBranch().then((s) => ({ orgId: s.stock.id, branchId: s.branchId })) : target(form);
    const ctx = await orgContextForPlatform(platform, orgId);
    id = await createKiosk(ctx, KioskInput.parse({ name: form.get('name'), branchId }));
    revalidatePath('/platform', 'layout');
    return { ok: true };
  });
  if (result.ok) redirect(`${page(id)}?key=1`);
  return result;
}

/** Stock (or a locked kiosk) → a shop + branch; then its key for the shop. */
export async function handToShopAction(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  const result = await runAction(async () => {
    const platform = await requirePlatform('platform.org.manage');
    const { orgId, branchId } = target(form);
    await moveKiosk(platform, orgId, { kioskRowId: id, branchId });
    revalidatePath('/platform', 'layout');
    return { ok: true };
  });
  if (result.ok) redirect(`${page(id)}?key=1`);
  return result;
}

export async function returnToStockPlatformAction(id: string, _: ActionState): Promise<ActionState> {
  return runAction(async () => {
    const platform = await requirePlatform('platform.org.manage');
    const { stock, branchId } = await stockBranch();
    await moveKiosk(platform, stock.id, { kioskRowId: id, branchId });
    revalidatePath('/platform', 'layout');
    return { ok: true, message: 'คืนตู้เข้าคลังแล้ว' };
  });
}

export async function resetLockAction(id: string, _: ActionState): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await kioskCtx(id);
    await unpairKiosk(ctx, id);
    revalidatePath(page(id), 'layout');
    return { ok: true, message: 'รีเซ็ตและล็อกตู้แล้ว ตู้จะล็อกตัวเองภายใน 1 นาที (หรือทันทีที่ออนไลน์) จนกว่าจะใส่ Key ใหม่' };
  });
}

export async function disablePlatformAction(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await kioskCtx(id);
    const { reason } = DisableInput.parse(formObject(form));
    await setKioskEnabled(ctx, id, false, reason);
    revalidatePath(page(id), 'layout');
    return { ok: true, message: 'ปิดการใช้งานแล้ว ตู้จะหยุดรับลูกค้าภายใน 1 นาที' };
  });
}

export async function enablePlatformAction(id: string, _: ActionState): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await kioskCtx(id);
    await setKioskEnabled(ctx, id, true);
    revalidatePath(page(id), 'layout');
    return { ok: true, message: 'เปิดการใช้งานแล้ว' };
  });
}

export async function archivePlatformAction(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await kioskCtx(id);
    await archiveKiosk(ctx, id, String(form.get('reason') ?? ''));
    revalidatePath('/platform', 'layout');
    return { ok: true, message: 'ยกเลิกตู้แล้ว เก็บไว้ในแท็บ "ยกเลิกแล้ว"' };
  });
}

export async function restorePlatformAction(id: string, _: ActionState): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await kioskCtx(id);
    await restoreKiosk(ctx, id);
    revalidatePath('/platform', 'layout');
    return { ok: true, message: 'นำตู้กลับมาใช้แล้ว ออก Key ใหม่เพื่อลงทะเบียน' };
  });
}
