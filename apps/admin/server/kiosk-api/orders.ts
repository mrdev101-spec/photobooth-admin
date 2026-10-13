import 'server-only';
import { and, eq, or } from 'drizzle-orm';
import type { OrderInputSchema, OrderPrintedSchema, OrderResponse } from '@photobooth/contracts';
import type { z } from 'zod';
import { db } from '@/server/db/client';
import { orderFiles, orders, orgStorage, type Order } from '@/server/db/schema';
import { newId } from '@/server/lib/ids';
import { isDuplicateKey } from '@/server/lib/errors';
import { assertKioskServing, type KioskAuth } from './auth';
import { KioskApiError } from './http';

type OrderData = z.output<typeof OrderInputSchema>;

/**
 * Image URLs must point into this customer's own bucket (and this kiosk's folder), so a kiosk
 * cannot make the Admin show arbitrary pictures. Without storage (dev) any http(s) URL passes.
 * Files that fail are left out (and counted); the sale itself is never refused because of them.
 */
export async function usableFiles<F extends { url: string; key?: string | null }>(auth: KioskAuth, files: F[]): Promise<{ files: F[]; dropped: number }> {
  if (!files.length) return { files, dropped: 0 };
  const storage = (await db().select({ publicUrl: orgStorage.publicUrl }).from(orgStorage).where(eq(orgStorage.orgId, auth.org.id)).limit(1))[0];
  const folder = `p/${auth.kiosk.kioskId}/`;
  const ok = files.filter((f) => (!storage || f.url.startsWith(`${storage.publicUrl}/`)) && (!f.key || f.key.startsWith(folder)));
  if (ok.length !== files.length) console.warn('[kiosk-api] order files outside the bucket/folder left out', { kiosk: auth.kiosk.kioskId, dropped: files.length - ok.length });
  return { files: ok, dropped: files.length - ok.length };
}

const response = (o: Pick<Order, 'id' | 'code' | 'status'>): OrderResponse => ({ orderId: o.id, code: o.code, status: o.status });

/** POST /orders — every sale. Safe to retry: the same clientOrderId returns the same order. */
export async function createOrderFromKiosk(auth: KioskAuth, data: OrderData): Promise<{ order: OrderResponse; created: boolean }> {
  assertKioskServing(auth);
  const { kiosk, org } = auth;

  const existing = (await db().select().from(orders).where(and(eq(orders.kioskRowId, kiosk.id), eq(orders.clientOrderId, data.clientOrderId))).limit(1))[0];
  if (existing) return { order: response(existing), created: false };

  const { files, dropped } = await usableFiles(auth, data.files);
  const id = newId('ord');
  const printedAt = data.printedAt ? new Date(data.printedAt) : null;
  const status = data.fulfillment === 'kiosk' && printedAt ? 'printed_at_kiosk' : 'uploaded';
  // Still recorded (the money really moved), but flagged for the platform to look into
  const flagList = [...(data.payment.kind === 'live' && !org.livePaymentsAllowed ? ['live_not_allowed'] : []), ...(dropped ? ['bad_files'] : [])];

  const insert = (code: string | null, flags: string[]) =>
    db().transaction(async (tx) => {
      await tx.insert(orders).values({
        id,
        orgId: org.id,
        branchId: kiosk.branchId,
        kioskRowId: kiosk.id,
        clientOrderId: data.clientOrderId,
        code,
        mode: data.mode,
        product: data.product,
        templateId: data.templateId ?? null,
        badge: data.badge ?? null,
        items: data.items,
        amountSatang: data.amount * 100,
        paymentKind: data.payment.kind,
        paymentRef: data.payment.ref ?? null,
        flags: flags.length ? flags : null,
        fulfillment: data.fulfillment,
        status,
        downloadUrl: data.downloadUrl ?? null,
        orderedAt: new Date(data.orderedAt),
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
        printedAt,
        queueNo: data.queueNo ?? null,
        eventId: kiosk.eventId ?? null
      });
      if (files.length) {
        await tx.insert(orderFiles).values(
          files.map((f) => ({ id: newId('ofl'), orderId: id, orgId: org.id, kind: f.kind, url: f.url, r2Key: f.key ?? null, width: f.width ?? null, height: f.height ?? null }))
        );
      }
    });

  let code = data.code ?? null;
  try {
    await insert(code, flagList);
  } catch (err) {
    if (!isDuplicateKey(err)) throw err;
    // Raced with a retry of the same order, or the pickup code is taken by another order
    const again = (await db().select().from(orders).where(and(eq(orders.kioskRowId, kiosk.id), eq(orders.clientOrderId, data.clientOrderId))).limit(1))[0];
    if (again) return { order: response(again), created: false };
    if (!code) throw err;
    // The sale is real: keep it without the clashing pickup code, flagged for staff
    code = null;
    await insert(null, [...flagList, 'pickup_code_conflict']);
  }
  return { order: { orderId: id, code, status }, created: true };
}

/** POST /orders/{ref}/printed — a kiosk-printed order came out of the printer. */
export async function markPrintedAtKiosk(auth: KioskAuth, ref: string, data: z.output<typeof OrderPrintedSchema>): Promise<OrderResponse> {
  const key = ref.toUpperCase().replace(/[^A-Z0-9_]/g, '');
  const order = (
    await db()
      .select()
      .from(orders)
      .where(and(eq(orders.kioskRowId, auth.kiosk.id), or(eq(orders.id, ref), eq(orders.code, key))))
      .limit(1)
  )[0];
  if (!order) throw new KioskApiError('PU0001', 404, 'ไม่พบออเดอร์');
  if (order.status === 'uploaded' && order.fulfillment === 'kiosk') {
    await db()
      .update(orders)
      .set({ status: 'printed_at_kiosk', printedAt: data.printedAt ? new Date(data.printedAt) : new Date() })
      .where(eq(orders.id, order.id));
    return response({ ...order, status: 'printed_at_kiosk' });
  }
  return response(order);
}
