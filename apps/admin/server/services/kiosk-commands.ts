import 'server-only';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { kioskCommands, kiosks, orders, printJobs } from '@/server/db/schema';
import { assertCan, type OrgContext } from '@/server/auth/context';
import { audit } from '@/server/audit';
import { AppError, notFound } from '@/server/lib/errors';
import { newId } from '@/server/lib/ids';

const LABEL = { reprint: 'พิมพ์ซ้ำ', cancel_print: 'ยกเลิกคิวพิมพ์' } as const;
const MAX_OPEN = 20;

/**
 * Event Console: reprint an order on the kiosk that printed it, or cancel what of it is still
 * waiting in the printer queue. Reaches the kiosk within a second or two (GET /kiosk/wait).
 */
export async function sendOrderCommand(ctx: OrgContext, orderId: string, type: 'reprint' | 'cancel_print') {
  const order = (await db().select().from(orders).where(and(eq(orders.id, orderId), eq(orders.orgId, ctx.org.id))).limit(1))[0];
  if (!order) throw notFound('ออเดอร์');
  assertCan(ctx, 'console.act', { branchId: order.branchId });
  if (order.fulfillment !== 'kiosk') throw new AppError('ออเดอร์นี้รับที่จุดรับรูป ไม่ได้พิมพ์ที่ตู้');
  const kiosk = (await db().select({ id: kiosks.id, status: kiosks.status }).from(kiosks).where(and(eq(kiosks.id, order.kioskRowId), eq(kiosks.orgId, ctx.org.id))).limit(1))[0];
  if (!kiosk || kiosk.status !== 'active') throw new AppError('ตู้นี้ไม่ได้เชื่อมต่ออยู่');
  const open = await db()
    .select({ id: kioskCommands.id })
    .from(kioskCommands)
    .where(and(eq(kioskCommands.kioskRowId, kiosk.id), inArray(kioskCommands.status, ['pending', 'sent'])))
    .limit(MAX_OPEN);
  if (open.length >= MAX_OPEN) throw new AppError('ตู้มีคำสั่งค้างมากเกินไป รอสักครู่');
  const id = newId('cmd');
  await db().insert(kioskCommands).values({ id, orgId: ctx.org.id, kioskRowId: kiosk.id, type, payload: { clientOrderId: order.clientOrderId, orderId: order.id }, createdBy: ctx.user.id });
  await audit({ user: ctx.user, orgId: ctx.org.id, actingAsPlatform: ctx.actingAsPlatform }, { action: `order.${type}`, resourceType: 'order', resourceId: order.id, after: { command: id } });
  return { id, label: LABEL[type] };
}

/** What the kiosk printed for an order, and the commands sent for it (newest first). */
export async function orderPrintState(ctx: OrgContext, orderId: string) {
  const jobs = await db().select().from(printJobs).where(and(eq(printJobs.orderId, orderId), eq(printJobs.orgId, ctx.org.id))).orderBy(printJobs.createdAt);
  const all = await db().select().from(kioskCommands).where(eq(kioskCommands.orgId, ctx.org.id)).orderBy(desc(kioskCommands.createdAt)).limit(200);
  return { jobs, commands: all.filter((c) => c.payload.orderId === orderId) };
}

/** Latest commands of the shop (the Event Console shows how they went). */
export async function recentCommands(ctx: OrgContext, limit = 50) {
  return db().select().from(kioskCommands).where(eq(kioskCommands.orgId, ctx.org.id)).orderBy(desc(kioskCommands.createdAt)).limit(limit);
}
