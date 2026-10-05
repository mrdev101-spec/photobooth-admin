import 'server-only';
import { and, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { branches, configEvents, kioskCommands, kiosks, orders, printJobs } from '@/server/db/schema';
import { assertCan, type OrgContext } from '@/server/auth/context';
import { can } from '@/server/auth/rbac';
import { branchWhere, orgWhere } from '@/server/tenancy/scoped';
import { connectionOf, type Connection } from '@/lib/kiosk-status';
import { TZ_OFFSET_HOURS, startOfThaiDay } from './orders';

/**
 * Event Console (the shop's live page at a booth event): kiosks, print queue, latest photos and
 * the day's summary, for today. Read every few seconds by the page, so every query is small.
 * Staff limited to some branches only see those; the summary needs report.view.
 */

export interface ConsoleFilter {
  eventId?: string | null;
  kioskId?: string | null;
}

export interface ConsoleKiosk {
  id: string;
  name: string;
  branch: string | null;
  connection: Connection;
  lastSeenAt: string | null;
  screen: string | null;
  mode: string | null;
  printers: { role: string; name: string; ok: boolean; error?: string }[];
  maintenance: boolean;
  emergency: boolean;
  eventId: string | null;
  settingsPending: boolean;
}

export interface ConsoleJob {
  id: string;
  orderId: string;
  queueNo: string | null;
  product: string;
  kiosk: string;
  kind: string;
  status: string;
  attempts: number;
  printer: string | null;
  error: string | null;
  updatedAt: string;
}

export interface ConsolePhoto {
  orderId: string;
  queueNo: string | null;
  product: string;
  kiosk: string;
  orderedAt: string;
  status: string;
  hasThumb: boolean;
}

export interface ConsoleSummary {
  orders: number;
  bySatang: Record<'live' | 'test' | 'simulated' | 'free', { orders: number; satang: number }>;
  byProduct: { product: string; orders: number; satang: number }[];
  byKiosk: { kiosk: string; orders: number; satang: number }[];
  byHour: { hour: number; orders: number }[];
}

export interface ConsoleFeed {
  at: string;
  kiosks: ConsoleKiosk[];
  jobs: ConsoleJob[];
  photos: ConsolePhoto[];
  summary: ConsoleSummary | null;
  commands: { id: string; type: string; status: string; message: string | null; orderId: string | null; createdAt: string }[];
}

const LIVE = ['pending', 'active', 'disabled'] as const;

export async function consoleEvents(ctx: OrgContext) {
  assertCan(ctx, 'console.view');
  return db().select({ id: configEvents.id, name: configEvents.name }).from(configEvents).where(and(eq(configEvents.orgId, ctx.org.id), eq(configEvents.isActive, true))).orderBy(configEvents.name);
}

export async function consoleFeed(ctx: OrgContext, filter: ConsoleFilter = {}): Promise<ConsoleFeed> {
  assertCan(ctx, 'console.view');
  const now = new Date();
  const from = startOfThaiDay(now);
  const to = new Date(from.getTime() + 86_400_000);
  const eventId = filter.eventId || null;
  const kioskId = filter.kioskId || null;

  const kioskRows = await db()
    .select({ kiosk: kiosks, branchName: branches.name })
    .from(kiosks)
    .leftJoin(branches, eq(branches.id, kiosks.branchId))
    .where(
      orgWhere(
        ctx,
        kiosks.orgId,
        inArray(kiosks.status, [...LIVE]),
        branchWhere(ctx, kiosks.branchId),
        eventId ? eq(kiosks.eventId, eventId) : undefined,
        kioskId ? eq(kiosks.id, kioskId) : undefined
      )
    )
    .orderBy(kiosks.name);
  const kioskIds = kioskRows.map((r) => r.kiosk.id);
  const nameOf = new Map(kioskRows.map((r) => [r.kiosk.id, r.kiosk.name]));

  const ts = now.getTime();
  const outKiosks: ConsoleKiosk[] = kioskRows.map(({ kiosk: k, branchName }) => ({
    id: k.id,
    name: k.name,
    branch: branchName,
    connection: connectionOf(k, ts),
    lastSeenAt: k.lastSeenAt ? k.lastSeenAt.toISOString() : null,
    screen: k.screen,
    mode: k.mode,
    printers: k.printerState ?? [],
    maintenance: k.maintenance,
    emergency: !!k.emergency,
    eventId: k.eventId,
    settingsPending: (k.appliedRevision ?? 0) < k.currentRevision && k.status === 'active'
  }));

  if (!kioskIds.length) return { at: now.toISOString(), kiosks: outKiosks, jobs: [], photos: [], summary: null, commands: [] };

  const orderScope = orgWhere(
    ctx,
    orders.orgId,
    inArray(orders.kioskRowId, kioskIds),
    gte(orders.orderedAt, from),
    lt(orders.orderedAt, to),
    eventId ? eq(orders.eventId, eventId) : undefined
  );

  const jobRows = await db()
    .select({ job: printJobs, queueNo: orders.queueNo, product: orders.product })
    .from(printJobs)
    .innerJoin(orders, eq(orders.id, printJobs.orderId))
    .where(and(orderScope, eq(printJobs.orgId, ctx.org.id)))
    .orderBy(desc(printJobs.updatedAt))
    .limit(80);

  const photoRows = await db()
    .select({ id: orders.id, queueNo: orders.queueNo, product: orders.product, kioskRowId: orders.kioskRowId, orderedAt: orders.orderedAt, status: orders.status, hasThumb: orders.hasThumb })
    .from(orders)
    .where(orderScope)
    .orderBy(desc(orders.orderedAt))
    .limit(36);

  let summary: ConsoleSummary | null = null;
  if (can(ctx.principal, 'report.view')) {
    const n = sql<number>`COUNT(*)`.mapWith(Number);
    const sum = sql<number>`COALESCE(SUM(${orders.amountSatang}), 0)`.mapWith(Number);
    const notCancelled = and(orderScope, sql`${orders.status} <> 'cancelled'`);
    const byPay = await db().select({ kind: orders.paymentKind, orders: n, satang: sum }).from(orders).where(notCancelled).groupBy(orders.paymentKind);
    const byProduct = await db().select({ product: orders.product, orders: n, satang: sum }).from(orders).where(notCancelled).groupBy(orders.product).orderBy(desc(n));
    const byKiosk = await db().select({ kioskRowId: orders.kioskRowId, orders: n, satang: sum }).from(orders).where(notCancelled).groupBy(orders.kioskRowId).orderBy(desc(n));
    const hour = sql<number>`HOUR(DATE_ADD(${orders.orderedAt}, INTERVAL ${sql.raw(String(TZ_OFFSET_HOURS))} HOUR))`.mapWith(Number);
    const byHour = await db().select({ hour, orders: n }).from(orders).where(notCancelled).groupBy(hour).orderBy(hour);
    const bySatang = { live: { orders: 0, satang: 0 }, test: { orders: 0, satang: 0 }, simulated: { orders: 0, satang: 0 }, free: { orders: 0, satang: 0 } };
    for (const r of byPay) bySatang[r.kind] = { orders: r.orders, satang: r.satang };
    summary = {
      orders: byPay.reduce((a, r) => a + r.orders, 0),
      bySatang,
      byProduct,
      byKiosk: byKiosk.map((r) => ({ kiosk: nameOf.get(r.kioskRowId) ?? '—', orders: r.orders, satang: r.satang })),
      byHour
    };
  }

  const cmdRows = await db()
    .select()
    .from(kioskCommands)
    .where(and(eq(kioskCommands.orgId, ctx.org.id), inArray(kioskCommands.kioskRowId, kioskIds), gte(kioskCommands.createdAt, from)))
    .orderBy(desc(kioskCommands.createdAt))
    .limit(20);

  return {
    at: now.toISOString(),
    kiosks: outKiosks,
    jobs: jobRows.map(({ job, queueNo, product }) => ({
      id: job.id,
      orderId: job.orderId,
      queueNo,
      product,
      kiosk: nameOf.get(job.kioskRowId) ?? '—',
      kind: job.kind,
      status: job.status,
      attempts: job.attempts,
      printer: job.printer,
      error: job.error,
      updatedAt: job.updatedAt.toISOString()
    })),
    photos: photoRows.map((o) => ({
      orderId: o.id,
      queueNo: o.queueNo,
      product: o.product,
      kiosk: nameOf.get(o.kioskRowId) ?? '—',
      orderedAt: o.orderedAt.toISOString(),
      status: o.status,
      hasThumb: o.hasThumb
    })),
    summary,
    commands: cmdRows.map((c) => ({ id: c.id, type: c.type, status: c.status, message: c.message, orderId: typeof c.payload.orderId === 'string' ? c.payload.orderId : null, createdAt: c.createdAt.toISOString() }))
  };
}
