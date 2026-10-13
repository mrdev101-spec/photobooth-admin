import 'server-only';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { KioskEventSchema, type KioskEventResult } from '@photobooth/contracts';
import { db } from '@/server/db/client';
import { orderFiles, orderThumbs, orders, printJobs } from '@/server/db/schema';
import { newId } from '@/server/lib/ids';
import { isDuplicateKey } from '@/server/lib/errors';
import type { KioskAuth } from './auth';
import { KioskApiError } from './http';
import { usableFiles, createOrderFromKiosk } from './orders';

type KioskEvent = z.output<typeof KioskEventSchema>;
const MAX_THUMB_BYTES = 300 * 1024;
const ORDER_WAIT_MS = 10 * 60_000;

async function findOrder(auth: KioskAuth, clientOrderId: string) {
  return (await db().select().from(orders).where(and(eq(orders.kioskRowId, auth.kiosk.id), eq(orders.clientOrderId, clientOrderId))).limit(1))[0];
}

async function handle(auth: KioskAuth, ev: KioskEvent): Promise<KioskEventResult> {
  if (ev.type === 'order') {
    const { order } = await createOrderFromKiosk(auth, ev.order);
    if (ev.thumbnail) {
      const jpeg = Buffer.from(ev.thumbnail.slice(ev.thumbnail.indexOf(',') + 1), 'base64');
      if (jpeg.length <= MAX_THUMB_BYTES && jpeg[0] === 0xff && jpeg[1] === 0xd8) {
        try {
          await db().insert(orderThumbs).values({ orderId: order.orderId, orgId: auth.org.id, jpeg });
        } catch (err) {
          if (!isDuplicateKey(err)) throw err; // retried order: thumbnail already stored
        }
        await db().update(orders).set({ hasThumb: true }).where(eq(orders.id, order.orderId));
      }
    }
    return { ok: true };
  }

  const order = await findOrder(auth, ev.clientOrderId);
  if (!order) {
    // Usually the order is still in the kiosk's outbox: keep this event for later. After a while
    // (the order was refused) drop it, so the outbox never gets stuck behind it.
    const at = 'at' in ev && typeof ev.at === 'string' ? Date.parse(ev.at) : NaN;
    const stale = Number.isFinite(at) && Date.now() - at > ORDER_WAIT_MS;
    return { ok: false, retry: !stale, code: 'order_missing', message: 'ยังไม่มีออเดอร์นี้' };
  }

  if (ev.type === 'files') {
    const { files } = await usableFiles(auth, ev.files);
    if (ev.downloadUrl) await db().update(orders).set({ downloadUrl: ev.downloadUrl }).where(eq(orders.id, order.id));
    if (files.length) {
      const known = await db().select({ url: orderFiles.url }).from(orderFiles).where(eq(orderFiles.orderId, order.id));
      const fresh = files.filter((f) => !known.some((k) => k.url === f.url));
      if (fresh.length) {
        await db().insert(orderFiles).values(fresh.map((f) => ({ id: newId('ofl'), orderId: order.id, orgId: auth.org.id, kind: f.kind, url: f.url, r2Key: f.key ?? null, width: f.width ?? null, height: f.height ?? null })));
      }
    }
    return { ok: true };
  }

  // Print job: the latest status wins; a new "printing" after a failure counts as another try
  const at = new Date(ev.at);
  const existing = (await db().select().from(printJobs).where(and(eq(printJobs.kioskRowId, auth.kiosk.id), eq(printJobs.clientJobId, ev.clientJobId))).limit(1))[0];
  const printedAt = ev.status === 'printed' ? at : null;
  if (existing) {
    await db()
      .update(printJobs)
      .set({
        status: ev.status,
        printer: ev.printer ?? existing.printer,
        error: ev.status === 'failed' ? (ev.error ?? 'พิมพ์ไม่สำเร็จ') : null,
        attempts: Math.max(existing.attempts, ev.attempt ?? existing.attempts),
        ...(printedAt ? { printedAt } : {})
      })
      .where(eq(printJobs.id, existing.id));
  } else {
    await db().insert(printJobs).values({
      id: newId('pjb'),
      orgId: auth.org.id,
      kioskRowId: auth.kiosk.id,
      orderId: order.id,
      clientJobId: ev.clientJobId,
      kind: ev.kind,
      status: ev.status,
      printer: ev.printer ?? null,
      error: ev.status === 'failed' ? (ev.error ?? 'พิมพ์ไม่สำเร็จ') : null,
      attempts: ev.attempt ?? 1,
      printedAt
    });
  }
  if (printedAt && ev.kind !== 'slip' && order.fulfillment === 'kiosk' && order.status === 'uploaded') {
    await db().update(orders).set({ status: 'printed_at_kiosk', printedAt }).where(eq(orders.id, order.id));
  }
  return { ok: true };
}

/**
 * POST /kiosk/events: the kiosk's outbox (orders, print jobs, files) in the order things
 * happened. Each event is safe to send again. Stops at the first event that must wait, so the
 * kiosk keeps the order of its outbox.
 */
export async function handleKioskEvents(auth: KioskAuth, raw: unknown[]): Promise<KioskEventResult[]> {
  const results: KioskEventResult[] = [];
  for (const item of raw) {
    const parsed = KioskEventSchema.safeParse(item);
    if (!parsed.success) {
      // A malformed event never gets better: report it and let the kiosk drop it
      results.push({ ok: false, code: 'AD0003', message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ').slice(0, 300) });
      continue;
    }
    try {
      const r = await handle(auth, parsed.data);
      results.push(r);
      if (r.retry) break;
    } catch (err) {
      if (err instanceof KioskApiError) {
        const retry = err.status >= 500 || err.code === 'AD0005' || err.code === 'AD0011';
        results.push({ ok: false, retry, code: err.code, message: err.message });
        if (retry) break;
        continue;
      }
      throw err;
    }
  }
  return results;
}
