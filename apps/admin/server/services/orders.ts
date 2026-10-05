import 'server-only';
import { and, asc, desc, eq, gte, inArray, lt, or, sql, type SQL } from 'drizzle-orm';
import { parsePickupInput } from '@photobooth/contracts';
import { db } from '@/server/db/client';
import { branches, kiosks, orderFiles, orders, organizations, orgStorage, users, type Order, type OrderFile, type OrderStatus } from '@/server/db/schema';
import { assertCan, type OrgContext, type PlatformContext } from '@/server/auth/context';
import { can } from '@/server/auth/rbac';
import { branchWhere, orgWhere } from '@/server/tenancy/scoped';
import { audit } from '@/server/audit';
import { AppError, notFound } from '@/server/lib/errors';

/** Owner side of orders (docs §18): order list, pickup counter, sales. */

export interface OrderRow extends Order {
  kioskName: string;
  branchName: string | null;
  files: OrderFile[];
}

const actor = (ctx: OrgContext) => ({ user: ctx.user, orgId: ctx.org.id, actingAsPlatform: ctx.actingAsPlatform });

/** Thailand has no DST: day boundaries for reports are UTC+7. */
export const TZ_OFFSET_HOURS = 7;

/** A pickup order past its expiry that was never collected shows as expired. */
export function effectiveStatus(o: Pick<Order, 'status' | 'expiresAt'>, now = Date.now()): OrderStatus {
  return o.status === 'uploaded' && o.expiresAt && o.expiresAt.getTime() < now ? 'expired' : o.status;
}

/**
 * Until when an order's full-quality originals are in the shop's R2: a pickup order's own expiry,
 * else the shop's "ลบภาพหลัง" (the lifecycle rule on p/) counted from the sale. null = no R2.
 */
export async function originalsUntil(o: Pick<Order, 'orgId' | 'orderedAt' | 'expiresAt'>): Promise<Date | null> {
  if (o.expiresAt) return o.expiresAt;
  const s = (await db().select({ days: orgStorage.lifecycleDays }).from(orgStorage).where(eq(orgStorage.orgId, o.orgId)).limit(1))[0];
  return s ? new Date(o.orderedAt.getTime() + s.days * 86_400_000) : null;
}

/** The R2 address the shop's files are served from (only these are fetched for downloads). */
export async function storagePublicUrl(orgId: string): Promise<string | null> {
  return (await db().select({ url: orgStorage.publicUrl }).from(orgStorage).where(eq(orgStorage.orgId, orgId)).limit(1))[0]?.url ?? null;
}

async function withFiles(rows: (Order & { kioskName: string; branchName: string | null })[]): Promise<OrderRow[]> {
  if (!rows.length) return [];
  const files = await db().select().from(orderFiles).where(inArray(orderFiles.orderId, rows.map((r) => r.id)));
  return rows.map((r) => ({ ...r, files: files.filter((f) => f.orderId === r.id) }));
}

function baseSelect() {
  return db()
    .select({ order: orders, kioskName: kiosks.name, branchName: branches.name })
    .from(orders)
    .innerJoin(kiosks, eq(kiosks.id, orders.kioskRowId))
    .leftJoin(branches, eq(branches.id, orders.branchId));
}

const flatten = (rows: { order: Order; kioskName: string; branchName: string | null }[]) => rows.map((r) => ({ ...r.order, kioskName: r.kioskName, branchName: r.branchName }));

export interface OrderFilter {
  from?: Date;
  to?: Date;
  kioskRowId?: string;
  status?: OrderStatus | 'waiting';
  fulfillment?: 'kiosk' | 'pickup';
  code?: string;
  limit?: number;
}

export async function listOrders(ctx: OrgContext, f: OrderFilter = {}): Promise<OrderRow[]> {
  assertCan(ctx, 'order.view');
  const conds: (SQL | undefined)[] = [
    branchWhere(ctx, orders.branchId),
    f.from ? gte(orders.orderedAt, f.from) : undefined,
    f.to ? lt(orders.orderedAt, f.to) : undefined,
    f.kioskRowId ? eq(orders.kioskRowId, f.kioskRowId) : undefined,
    f.fulfillment ? eq(orders.fulfillment, f.fulfillment) : undefined,
    f.code ? eq(orders.code, f.code) : undefined,
    f.status === 'waiting' ? and(eq(orders.fulfillment, 'pickup'), inArray(orders.status, ['uploaded', 'claimed'])) : f.status ? eq(orders.status, f.status) : undefined
  ];
  const rows = await baseSelect()
    .where(orgWhere(ctx, orders.orgId, ...conds))
    .orderBy(desc(orders.orderedAt))
    .limit(Math.min(f.limit ?? 200, 1000));
  return withFiles(flatten(rows));
}

export async function getOrder(ctx: OrgContext, id: string): Promise<OrderRow & { claimedByName: string | null }> {
  assertCan(ctx, 'order.view');
  const row = (await baseSelect().where(orgWhere(ctx, orders.orgId, eq(orders.id, id))).limit(1))[0];
  if (!row || !can(ctx.principal, 'order.view', { branchId: row.order.branchId })) throw notFound('ออเดอร์');
  const [full] = await withFiles(flatten([row]));
  const claimedBy = row.order.claimedBy ? (await db().select({ name: users.name }).from(users).where(eq(users.id, row.order.claimedBy)).limit(1))[0]?.name ?? null : null;
  return { ...full!, claimedByName: claimedBy };
}

/** What the pickup counter scanned or typed → the order of this customer, or null. */
export async function findOrderByPickupInput(ctx: OrgContext, input: string): Promise<OrderRow | null> {
  assertCan(ctx, 'pickup.use');
  const parsed = parsePickupInput(input);
  if (!parsed) throw new AppError('รหัสรับรูปไม่ถูกต้อง (6 ตัว เช่น ZHK-6Q6)');
  const row = (await baseSelect().where(orgWhere(ctx, orders.orgId, eq(orders.code, parsed.code), branchWhere(ctx, orders.branchId))).limit(1))[0];
  if (!row) return null;
  return (await withFiles(flatten([row])))[0]!;
}

/** Pickup counter: orders waiting (oldest first) and the latest handovers. */
export async function pickupQueue(ctx: OrgContext, filter: { eventId?: string | null } = {}) {
  assertCan(ctx, 'pickup.use');
  const now = new Date();
  const waiting = await baseSelect()
    .where(
      orgWhere(
        ctx,
        orders.orgId,
        branchWhere(ctx, orders.branchId),
        eq(orders.fulfillment, 'pickup'),
        filter.eventId ? eq(orders.eventId, filter.eventId) : undefined,
        inArray(orders.status, ['uploaded', 'claimed']),
        or(sql`${orders.expiresAt} IS NULL`, gte(orders.expiresAt, now))
      )
    )
    .orderBy(asc(orders.orderedAt))
    .limit(200);
  const recent = await baseSelect()
    .where(orgWhere(ctx, orders.orgId, branchWhere(ctx, orders.branchId), eq(orders.fulfillment, 'pickup'), filter.eventId ? eq(orders.eventId, filter.eventId) : undefined, eq(orders.status, 'handed_over')))
    .orderBy(desc(orders.handedOverAt))
    .limit(10);
  return { waiting: await withFiles(flatten(waiting)), recent: await withFiles(flatten(recent)) };
}

/**
 * Claims a pickup order for printing — once. A claimed order can be printed again by the
 * counter if the print failed (not yet handed over); after handover only when a manager
 * allowed a reprint. The conditional UPDATE makes two counters claiming at once impossible.
 */
export async function claimOrder(ctx: OrgContext, id: string, station: string) {
  assertCan(ctx, 'pickup.use');
  const order = await getOrder(ctx, id);
  if (order.fulfillment !== 'pickup') throw new AppError('ออเดอร์นี้พิมพ์ที่ตู้แล้ว ไม่ต้องรับที่จุดรับรูป');
  if (effectiveStatus(order) === 'expired') throw new AppError('ออเดอร์นี้หมดอายุแล้ว (ภาพถูกลบตามเวลาที่ตั้ง)');
  const now = new Date();
  const set = { status: 'claimed' as const, claimedAt: now, claimedBy: ctx.user.id, claimedStation: station.slice(0, 60) || null };
  const reprint = order.status === 'handed_over' && order.reprintAllowance > 0;

  const [res] = await db()
    .update(orders)
    .set(reprint ? { ...set, reprintAllowance: sql`${orders.reprintAllowance} - 1` } : set)
    .where(
      and(
        eq(orders.id, id),
        eq(orders.orgId, ctx.org.id),
        reprint ? and(eq(orders.status, 'handed_over'), sql`${orders.reprintAllowance} > 0`) : inArray(orders.status, ['uploaded', 'claimed'])
      )
    );
  if (res.affectedRows !== 1) {
    const when = order.handedOverAt ?? order.claimedAt;
    throw new AppError(`ออเดอร์นี้รับไปแล้ว${when ? ` เมื่อ ${when.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' })}` : ''}${order.claimedStation ? ` ที่ ${order.claimedStation}` : ''}`, 'conflict');
  }
  await audit(actor(ctx), { action: reprint ? 'order.reprint_claim' : 'order.claim', resourceType: 'order', resourceId: id, after: { code: order.code, station } });
}

export async function handOverOrder(ctx: OrgContext, id: string) {
  assertCan(ctx, 'pickup.use');
  const [res] = await db()
    .update(orders)
    .set({ status: 'handed_over', handedOverAt: new Date() })
    .where(and(eq(orders.id, id), eq(orders.orgId, ctx.org.id), eq(orders.status, 'claimed')));
  if (res.affectedRows !== 1) throw new AppError('ต้องกด “พิมพ์” ก่อนยืนยันส่งมอบ');
  await audit(actor(ctx), { action: 'order.hand_over', resourceType: 'order', resourceId: id });
}

export async function allowReprint(ctx: OrgContext, id: string) {
  const order = await getOrder(ctx, id);
  assertCan(ctx, 'order.reprint', { branchId: order.branchId });
  if (order.fulfillment !== 'pickup' || order.status !== 'handed_over') throw new AppError('อนุญาตพิมพ์ซ้ำได้เฉพาะออเดอร์จุดรับรูปที่ส่งมอบแล้ว');
  await db()
    .update(orders)
    .set({ reprintAllowance: sql`${orders.reprintAllowance} + 1` })
    .where(and(eq(orders.id, id), eq(orders.orgId, ctx.org.id)));
  await audit(actor(ctx), { action: 'order.allow_reprint', resourceType: 'order', resourceId: id, after: { code: order.code } });
}

// ─── Sales ──────────────────────────────────────────────────────────────────

export interface SalesSummary {
  total: { orders: number; liveOrders: number; liveSatang: number; otherSatang: number };
  byStatus: Record<string, number>;
  byDay: { day: string; orders: number; liveSatang: number }[];
  byKiosk: { kioskRowId: string; name: string; orders: number; liveSatang: number }[];
  byProduct: { product: string; orders: number; liveSatang: number }[];
}

/** Sales between [from, to). "live" = real money; test / simulated / free are counted apart. */
export async function salesSummary(ctx: OrgContext, from: Date, to: Date): Promise<SalesSummary> {
  assertCan(ctx, 'report.view');
  const where = orgWhere(ctx, orders.orgId, branchWhere(ctx, orders.branchId), gte(orders.orderedAt, from), lt(orders.orderedAt, to), sql`${orders.status} <> 'cancelled'`);
  const live = sql<number>`COALESCE(SUM(CASE WHEN ${orders.paymentKind} = 'live' THEN ${orders.amountSatang} ELSE 0 END), 0)`.mapWith(Number);
  const other = sql<number>`COALESCE(SUM(CASE WHEN ${orders.paymentKind} <> 'live' THEN ${orders.amountSatang} ELSE 0 END), 0)`.mapWith(Number);
  const n = sql<number>`COUNT(*)`.mapWith(Number);
  const liveN = sql<number>`COALESCE(SUM(CASE WHEN ${orders.paymentKind} = 'live' THEN 1 ELSE 0 END), 0)`.mapWith(Number);
  const day = sql<string>`DATE_FORMAT(DATE_ADD(${orders.orderedAt}, INTERVAL ${sql.raw(String(TZ_OFFSET_HOURS))} HOUR), '%Y-%m-%d')`;

  const [total] = await db().select({ orders: n, liveOrders: liveN, liveSatang: live, otherSatang: other }).from(orders).where(where);
  const statusRows = await db().select({ status: orders.status, n }).from(orders).where(where).groupBy(orders.status);
  const byDay = await db().select({ day, orders: n, liveSatang: live }).from(orders).where(where).groupBy(day).orderBy(day);
  const byKiosk = await db()
    .select({ kioskRowId: orders.kioskRowId, name: kiosks.name, orders: n, liveSatang: live })
    .from(orders)
    .innerJoin(kiosks, eq(kiosks.id, orders.kioskRowId))
    .where(where)
    .groupBy(orders.kioskRowId, kiosks.name)
    .orderBy(desc(live));
  const byProduct = await db().select({ product: orders.product, orders: n, liveSatang: live }).from(orders).where(where).groupBy(orders.product).orderBy(desc(n));

  return {
    total: total ?? { orders: 0, liveOrders: 0, liveSatang: 0, otherSatang: 0 },
    byStatus: Object.fromEntries(statusRows.map((r) => [r.status, r.n])),
    byDay,
    byKiosk,
    byProduct
  };
}

/** Start of "today" in Thai time, as a UTC Date. */
export function startOfThaiDay(d = new Date()): Date {
  const shifted = new Date(d.getTime() + TZ_OFFSET_HOURS * 3600_000);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - TZ_OFFSET_HOURS * 3600_000);
}

// ─── Platform ───────────────────────────────────────────────────────────────

/** Flagged orders (e.g. live money from an account not allowed to take it), per customer. */
export async function flaggedOrdersByOrg(_ctx: PlatformContext, since: Date) {
  const n = sql<number>`COUNT(*)`.mapWith(Number);
  const last = sql<Date>`MAX(${orders.orderedAt})`.mapWith((v: unknown) => (v instanceof Date ? v : new Date(`${String(v).replace(' ', 'T')}Z`)));
  return db()
    .select({ orgId: organizations.id, orgName: organizations.name, orgSlug: organizations.slug, orders: n, lastAt: last })
    .from(orders)
    .innerJoin(organizations, eq(organizations.id, orders.orgId))
    .where(and(sql`${orders.flags} IS NOT NULL AND JSON_LENGTH(${orders.flags}) > 0`, gte(orders.orderedAt, since)))
    .groupBy(organizations.id, organizations.name, organizations.slug)
    .orderBy(desc(n));
}
