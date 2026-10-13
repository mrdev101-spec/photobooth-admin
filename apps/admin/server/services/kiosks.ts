import 'server-only';
import { and, count, desc, eq, gt, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { PAIR_CODE_ALPHABET, PAIR_CODE_LENGTH } from '@photobooth/contracts';
import { NEW_KIOSK_OWN_SECTIONS } from '@/lib/config-layers';
import { db } from '@/server/db/client';
import { auditLogs, branches, kioskPairCodes, kioskTokens, kiosks, orders, organizations, users, type Kiosk } from '@/server/db/schema';
import { assertCan, type OrgContext } from '@/server/auth/context';
import { can } from '@/server/auth/rbac';
import { branchWhere, orgWhere } from '@/server/tenancy/scoped';
import { audit } from '@/server/audit';
import { randomCode, sha256Hex } from '@/server/lib/crypto';
import { newId } from '@/server/lib/ids';
import { AppError, forbidden, isDuplicateKey, notFound } from '@/server/lib/errors';
import { isFull } from '@/lib/quota';

export const PAIR_CODE_TTL_MS = 15 * 60_000;
/** Activation keys from the platform: given to a technician or a customer, so they last longer. */
export const KEY_TTL_MS = 30 * 86_400_000;
export const KEY_LENGTH = 12;

export const KioskInput = z.object({
  name: z.string().trim().min(1, 'กรอกชื่อตู้').max(100),
  branchId: z.string().min(1, 'เลือกสาขา').max(32)
});

const actor = (ctx: OrgContext) => ({ user: ctx.user, orgId: ctx.org.id, actingAsPlatform: ctx.actingAsPlatform });

/** Kiosks that exist for the customer: count toward the quota and show in lists. */
const LIVE_STATUSES = ['pending', 'active', 'disabled'] as const;

/**
 * Adding, pairing and unpairing kiosks (decision D12): the platform team does it; a customer
 * only when the platform switched on "customer can add kiosks" for that account.
 */
export function canManageFleet(ctx: OrgContext): boolean {
  return !!ctx.principal.platformRole || ctx.org.customerCanAddKiosks;
}

function assertFleet(ctx: OrgContext) {
  if (!canManageFleet(ctx)) throw new AppError('การเพิ่ม จับคู่ หรือยกเลิกการเชื่อมต่อตู้ ทำโดยผู้ให้บริการ กรุณาติดต่อผู้ให้บริการ', 'forbidden');
}

/** XXXX-XXXX (pairing code) or XXXX-XXXX-XXXX (key) for display; the kiosk accepts it with or without dashes. */
export const formatPairCode = (code: string) => code.match(/.{1,4}/g)!.join('-');

/** `includeArchived`: retired kiosks too (filters over past sales); they are revoked as well. */
export async function listKiosks(ctx: OrgContext, filter: { branchId?: string; includeRevoked?: boolean; includeArchived?: boolean } = {}) {
  assertCan(ctx, 'kiosk.view');
  return db()
    .select({ kiosk: kiosks, branchName: branches.name })
    .from(kiosks)
    .leftJoin(branches, eq(branches.id, kiosks.branchId))
    .where(
      orgWhere(
        ctx,
        kiosks.orgId,
        branchWhere(ctx, kiosks.branchId),
        filter.branchId ? eq(kiosks.branchId, filter.branchId) : undefined,
        filter.includeRevoked ? undefined : inArray(kiosks.status, [...LIVE_STATUSES]),
        // retired kiosks live in the history page only
        filter.includeArchived ? undefined : isNull(kiosks.archivedAt)
      )
    )
    .orderBy(kiosks.name);
}

export async function getKiosk(ctx: OrgContext, id: string): Promise<{ kiosk: Kiosk; branchName: string | null }> {
  const row = (
    await db()
      .select({ kiosk: kiosks, branchName: branches.name })
      .from(kiosks)
      .leftJoin(branches, eq(branches.id, kiosks.branchId))
      .where(orgWhere(ctx, kiosks.orgId, eq(kiosks.id, id)))
      .limit(1)
  )[0];
  if (!row || !can(ctx.principal, 'kiosk.view', { branchId: row.kiosk.branchId })) throw notFound('ตู้');
  return row;
}

async function getForManage(ctx: OrgContext, id: string, action: 'kiosk.manage' | 'kiosk.command' = 'kiosk.manage') {
  const { kiosk } = await getKiosk(ctx, id);
  assertCan(ctx, action, { branchId: kiosk.branchId });
  return kiosk;
}

async function checkBranch(ctx: OrgContext, branchId: string) {
  const b = (await db().select({ id: branches.id, isActive: branches.isActive }).from(branches).where(orgWhere(ctx, branches.orgId, eq(branches.id, branchId))).limit(1))[0];
  if (!b) throw new AppError('ไม่พบสาขา');
  if (!b.isActive) throw new AppError('สาขานี้ปิดใช้งานอยู่');
  assertCan(ctx, 'kiosk.manage', { branchId });
}

/** Kiosks that count toward the quota: waiting to pair, paired, or disabled by the platform. */
async function usedQuota(ctx: OrgContext): Promise<number> {
  const r = await db().select({ n: count() }).from(kiosks).where(orgWhere(ctx, kiosks.orgId, inArray(kiosks.status, [...LIVE_STATUSES])));
  return r[0]?.n ?? 0;
}

export async function kioskQuotaUsage(ctx: OrgContext) {
  return { used: await usedQuota(ctx), quota: ctx.org.kioskQuota };
}

export async function createKiosk(ctx: OrgContext, input: z.infer<typeof KioskInput>): Promise<string> {
  assertCan(ctx, 'kiosk.manage');
  assertFleet(ctx);
  await checkBranch(ctx, input.branchId);
  if (isFull(await usedQuota(ctx), ctx.org.kioskQuota)) {
    throw new AppError(`บัญชีนี้มีตู้ครบ ${ctx.org.kioskQuota} เครื่องตามโควตาแล้ว ติดต่อผู้ดูแลแพลตฟอร์มเพื่อเพิ่ม`, 'conflict');
  }
  const id = newId('ksk');
  // New kiosks follow the customer's defaults / their event except for their name and location
  await db().insert(kiosks).values({ id, orgId: ctx.org.id, branchId: input.branchId, name: input.name, ownSections: NEW_KIOSK_OWN_SECTIONS });
  await audit(actor(ctx), { action: 'kiosk.create', resourceType: 'kiosk', resourceId: id, after: input });
  return id;
}

export async function updateKiosk(ctx: OrgContext, id: string, input: z.infer<typeof KioskInput>) {
  const before = await getForManage(ctx, id);
  if (input.branchId !== before.branchId) await checkBranch(ctx, input.branchId);
  await db().update(kiosks).set({ name: input.name, branchId: input.branchId }).where(orgWhere(ctx, kiosks.orgId, eq(kiosks.id, id)));
  await audit(actor(ctx), {
    action: 'kiosk.update',
    resourceType: 'kiosk',
    resourceId: id,
    before: { name: before.name, branchId: before.branchId },
    after: input
  });
}

/**
 * New pairing code (8 characters, 15 minutes) or activation key (12 characters, 30 days,
 * platform only) for a kiosk that is waiting to register (or was reset). Either is good for one
 * machine, once; earlier unused codes for the kiosk stop working. Returned in clear once; only
 * its hash is stored.
 */
export async function createPairCode(ctx: OrgContext, id: string, kind: 'pair' | 'key' = 'pair'): Promise<{ code: string; expiresAt: Date }> {
  const kiosk = await getForManage(ctx, id);
  assertFleet(ctx);
  if (kind === 'key' && !ctx.principal.platformRole) throw forbidden();
  if (kiosk.status === 'active' || kiosk.status === 'disabled') throw new AppError('ตู้นี้เชื่อมต่ออยู่แล้ว ยกเลิกการเชื่อมต่อก่อนถ้าต้องการจับคู่ใหม่');
  if (kiosk.status === 'revoked' && isFull(await usedQuota(ctx), ctx.org.kioskQuota)) {
    throw new AppError(`บัญชีนี้มีตู้ครบ ${ctx.org.kioskQuota} เครื่องตามโควตาแล้ว`, 'conflict');
  }
  const now = new Date();
  const expiresAt = new Date(now.getTime() + (kind === 'key' ? KEY_TTL_MS : PAIR_CODE_TTL_MS));

  for (let attempt = 0; attempt < 3; attempt++) {
    const code = randomCode(PAIR_CODE_ALPHABET, kind === 'key' ? KEY_LENGTH : PAIR_CODE_LENGTH);
    try {
      await db().transaction(async (tx) => {
        await tx
          .update(kioskPairCodes)
          .set({ expiresAt: now })
          .where(and(eq(kioskPairCodes.kioskRowId, id), isNull(kioskPairCodes.usedAt), gt(kioskPairCodes.expiresAt, now)));
        await tx.insert(kioskPairCodes).values({ id: newId('kpc'), orgId: ctx.org.id, kioskRowId: id, codeHash: sha256Hex(code), kind, expiresAt, createdBy: ctx.user.id });
        if (kiosk.status === 'revoked') await tx.update(kiosks).set({ status: 'pending' }).where(eq(kiosks.id, id));
      });
      await audit(actor(ctx), { action: kind === 'key' ? 'kiosk.key' : 'kiosk.pair_code', resourceType: 'kiosk', resourceId: id });
      return { code: formatPairCode(code), expiresAt };
    } catch (err) {
      if (!isDuplicateKey(err)) throw err; // astronomically rare collision: draw again
    }
  }
  throw new AppError('สร้างรหัสไม่สำเร็จ ลองใหม่');
}

export async function kioskPairState(ctx: OrgContext, id: string) {
  const { kiosk } = await getKiosk(ctx, id);
  return { status: kiosk.status, kioskId: kiosk.kioskId };
}

/**
 * Reset and lock: the device token stops working; the kiosk app clears what it got from the
 * Admin and locks itself until a new key is entered (installed kiosks).
 */
export async function unpairKiosk(ctx: OrgContext, id: string) {
  const kiosk = await getForManage(ctx, id);
  assertFleet(ctx);
  if (kiosk.status === 'revoked') return;
  const now = new Date();
  await db().transaction(async (tx) => {
    await tx.update(kioskTokens).set({ revokedAt: now }).where(and(eq(kioskTokens.kioskRowId, id), isNull(kioskTokens.revokedAt)));
    await tx.update(kioskPairCodes).set({ expiresAt: now }).where(and(eq(kioskPairCodes.kioskRowId, id), isNull(kioskPairCodes.usedAt)));
    await tx
      .update(kiosks)
      .set({
        status: 'revoked',
        kioskId: null,
        formerKioskId: kiosk.kioskId ?? kiosk.formerKioskId,
        revokedAt: now,
        fingerprintMismatch: false,
        appliedRevision: null,
        manifestRevision: null,
        emergency: null,
        maintenance: false
      })
      .where(eq(kiosks.id, id));
  });
  await audit(actor(ctx), { action: 'kiosk.unpair', resourceType: 'kiosk', resourceId: id, before: { kioskId: kiosk.kioskId, status: kiosk.status } });
}

/** The booth's machine was replaced on purpose: trust the new fingerprint. */
export async function acceptFingerprint(ctx: OrgContext, id: string) {
  const kiosk = await getForManage(ctx, id);
  assertFleet(ctx);
  if (!kiosk.fingerprintMismatch || !kiosk.reportedFingerprint) return;
  await db()
    .update(kiosks)
    .set({ fingerprint: kiosk.reportedFingerprint, fingerprintMismatch: false })
    .where(orgWhere(ctx, kiosks.orgId, eq(kiosks.id, id)));
  await audit(actor(ctx), {
    action: 'kiosk.accept_fingerprint',
    resourceType: 'kiosk',
    resourceId: id,
    before: { fingerprint: kiosk.fingerprint },
    after: { fingerprint: kiosk.reportedFingerprint }
  });
}

export async function setMaintenance(ctx: OrgContext, id: string, on: boolean) {
  const kiosk = await getForManage(ctx, id, 'kiosk.command');
  if (kiosk.status === 'disabled') throw new AppError('ตู้นี้ถูกปิดใช้งานโดยผู้ให้บริการ');
  await db().update(kiosks).set({ maintenance: on }).where(orgWhere(ctx, kiosks.orgId, eq(kiosks.id, id)));
  await audit(actor(ctx), { action: on ? 'kiosk.maintenance_on' : 'kiosk.maintenance_off', resourceType: 'kiosk', resourceId: id, before: { maintenance: kiosk.maintenance } });
}

/** Removes a kiosk that never paired (a mistake). Paired kiosks are unpaired instead, to keep history. */
export async function deletePendingKiosk(ctx: OrgContext, id: string) {
  const kiosk = await getForManage(ctx, id);
  assertFleet(ctx);
  if (kiosk.status !== 'pending' || kiosk.pairedAt) throw new AppError('ลบได้เฉพาะตู้ที่ยังไม่เคยเชื่อมต่อ ตู้ที่เคยใช้งานให้ยกเลิกการเชื่อมต่อแทน');
  await db().transaction(async (tx) => {
    await tx.delete(kioskPairCodes).where(eq(kioskPairCodes.kioskRowId, id));
    await tx.delete(kiosks).where(and(eq(kiosks.id, id), eq(kiosks.orgId, ctx.org.id)));
  });
  await audit(actor(ctx), { action: 'kiosk.delete', resourceType: 'kiosk', resourceId: id, before: { name: kiosk.name } });
}

/** Every kiosk on the platform (stock included, reset / locked ones too), for the platform console. */
export async function listAllKiosks(filter: { orgId?: string } = {}) {
  return db()
    .select({ kiosk: kiosks, orgId: organizations.id, orgName: organizations.name, orgSlug: organizations.slug, orgKind: organizations.kind, orgStatus: organizations.status, branchName: branches.name })
    .from(kiosks)
    .innerJoin(organizations, eq(organizations.id, kiosks.orgId))
    .leftJoin(branches, eq(branches.id, kiosks.branchId))
    .where(and(isNull(organizations.deletedAt), filter.orgId ? eq(kiosks.orgId, filter.orgId) : undefined))
    .orderBy(organizations.kind, organizations.name, kiosks.name);
}

export const DisableInput = z.object({ reason: z.string().trim().min(1, 'ระบุเหตุผล (ลูกค้าเห็นข้อความนี้)').max(255) });

/**
 * Switches a kiosk off or on (platform admins only). The device token is kept, so switching
 * back on needs no new pairing. A disabled kiosk refuses new customers and payments.
 */
export async function setKioskEnabled(ctx: OrgContext, id: string, enabled: boolean, reason?: string) {
  if (ctx.principal.platformRole !== 'platform_admin') throw forbidden();
  const { kiosk } = await getKiosk(ctx, id);
  if (enabled ? kiosk.status !== 'disabled' : kiosk.status !== 'active') {
    throw new AppError(enabled ? 'ตู้นี้ไม่ได้ถูกปิดใช้งาน' : 'ปิดใช้งานได้เฉพาะตู้ที่เชื่อมต่ออยู่');
  }
  await db()
    .update(kiosks)
    .set(enabled ? { status: 'active', disabledReason: null, disabledAt: null } : { status: 'disabled', disabledReason: reason ?? null, disabledAt: new Date() })
    .where(orgWhere(ctx, kiosks.orgId, eq(kiosks.id, id)));
  await audit(actor(ctx), {
    action: enabled ? 'kiosk.enable' : 'kiosk.disable',
    resourceType: 'kiosk',
    resourceId: id,
    before: { status: kiosk.status },
    after: enabled ? { status: 'active' } : { status: 'disabled', reason }
  });
}

/**
 * "ยกเลิกตู้": unpaired for good (the machine locks) and kept as history — its sales, settings and
 * audit stay, it leaves the kiosk lists, the Event Console and the quota.
 */
export async function archiveKiosk(ctx: OrgContext, id: string, reason: string) {
  const kiosk = await getForManage(ctx, id);
  assertFleet(ctx);
  if (kiosk.archivedAt) return;
  if (kiosk.status !== 'revoked') {
    if (kiosk.status === 'pending' && !kiosk.pairedAt) {
      // never paired: nothing to cut off, just no more codes
      const now = new Date();
      await db().update(kioskPairCodes).set({ expiresAt: now }).where(and(eq(kioskPairCodes.kioskRowId, id), isNull(kioskPairCodes.usedAt)));
      await db().update(kiosks).set({ status: 'revoked', revokedAt: now }).where(eq(kiosks.id, id));
    } else {
      await unpairKiosk(ctx, id);
    }
  }
  const why = reason.trim().slice(0, 255) || null;
  await db().update(kiosks).set({ archivedAt: new Date(), archivedReason: why, archivedBy: ctx.user.id, maintenance: false }).where(and(eq(kiosks.id, id), eq(kiosks.orgId, ctx.org.id)));
  await audit(actor(ctx), { action: 'kiosk.archive', resourceType: 'kiosk', resourceId: id, before: { name: kiosk.name, status: kiosk.status }, after: { reason: why } });
}

/** Back from the history: in the kiosk list again, waiting for a new pairing code (quota permitting). */
export async function restoreKiosk(ctx: OrgContext, id: string) {
  const kiosk = await getForManage(ctx, id);
  assertFleet(ctx);
  if (!kiosk.archivedAt) return;
  if (isFull(await usedQuota(ctx), ctx.org.kioskQuota)) {
    throw new AppError(`บัญชีนี้มีตู้ครบ ${ctx.org.kioskQuota} เครื่องตามโควตาแล้ว ยกเลิกตู้อื่นก่อน หรือติดต่อผู้ดูแลแพลตฟอร์มเพื่อเพิ่ม`, 'conflict');
  }
  await db().update(kiosks).set({ status: 'pending', archivedAt: null, archivedReason: null, archivedBy: null }).where(and(eq(kiosks.id, id), eq(kiosks.orgId, ctx.org.id)));
  await audit(actor(ctx), { action: 'kiosk.restore', resourceType: 'kiosk', resourceId: id, before: { archivedAt: kiosk.archivedAt, reason: kiosk.archivedReason } });
}

/** Retired kiosks with what they did while in use (orders, sales), newest first. */
export async function listArchivedKiosks(ctx: OrgContext) {
  assertCan(ctx, 'kiosk.view');
  const rows = await db()
    .select({ kiosk: kiosks, branchName: branches.name, archivedByName: users.name })
    .from(kiosks)
    .leftJoin(branches, eq(branches.id, kiosks.branchId))
    .leftJoin(users, eq(users.id, kiosks.archivedBy))
    .where(orgWhere(ctx, kiosks.orgId, branchWhere(ctx, kiosks.branchId), isNotNull(kiosks.archivedAt)))
    .orderBy(desc(kiosks.archivedAt));
  if (!rows.length) return [];
  const stats = await db()
    .select({
      kioskRowId: orders.kioskRowId,
      orders: count(),
      salesSatang: sql<number>`COALESCE(SUM(CASE WHEN ${orders.status} <> 'cancelled' THEN ${orders.amountSatang} ELSE 0 END), 0)`.mapWith(Number),
      firstAt: sql<Date | null>`MIN(${orders.orderedAt})`,
      lastAt: sql<Date | null>`MAX(${orders.orderedAt})`
    })
    .from(orders)
    .where(and(eq(orders.orgId, ctx.org.id), inArray(orders.kioskRowId, rows.map((r) => r.kiosk.id))))
    .groupBy(orders.kioskRowId);
  const byId = new Map(stats.map((s) => [s.kioskRowId, s]));
  return rows.map((r) => ({ ...r, stats: byId.get(r.kiosk.id) ?? { orders: 0, salesSatang: 0, firstAt: null, lastAt: null } }));
}

export async function archivedKioskCount(ctx: OrgContext): Promise<number> {
  const r = await db().select({ n: count() }).from(kiosks).where(orgWhere(ctx, kiosks.orgId, branchWhere(ctx, kiosks.branchId), isNotNull(kiosks.archivedAt)));
  return r[0]?.n ?? 0;
}

/** One kiosk anywhere on the platform (stock or a customer), for the Platform kiosk pages. */
export async function getPlatformKiosk(id: string) {
  const row = (
    await db()
      .select({ kiosk: kiosks, org: organizations, branchName: branches.name })
      .from(kiosks)
      .innerJoin(organizations, eq(organizations.id, kiosks.orgId))
      .leftJoin(branches, eq(branches.id, kiosks.branchId))
      .where(and(eq(kiosks.id, id), isNull(organizations.deletedAt)))
      .limit(1)
  )[0];
  if (!row) throw notFound('ตู้');
  return row;
}

/** A kiosk's history from the audit log (all accounts it has been in), newest first. */
export async function kioskTimeline(id: string, limit = 50) {
  const rows = await db()
    .select({ action: auditLogs.action, at: auditLogs.at, orgId: auditLogs.orgId, orgName: organizations.name, userName: users.name, before: auditLogs.before, after: auditLogs.after })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.userId))
    .leftJoin(organizations, eq(organizations.id, auditLogs.orgId))
    .where(and(eq(auditLogs.resourceType, 'kiosk'), eq(auditLogs.resourceId, id)))
    .orderBy(desc(auditLogs.at))
    .limit(limit);
  // a move is logged in both accounts: keep one
  const seen = new Set<string>();
  return rows.filter((r) => {
    const key = `${r.action}|${r.at.getTime()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
