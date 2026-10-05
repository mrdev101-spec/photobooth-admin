import 'server-only';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/server/db/client';
import { branches, kioskPairCodes, kiosks, organizations } from '@/server/db/schema';
import type { PlatformContext } from '@/server/auth/context';
import { canPlatform } from '@/server/auth/rbac';
import { audit } from '@/server/audit';
import { AppError, forbidden, notFound } from '@/server/lib/errors';
import { isFull } from '@/lib/quota';
import { NEW_KIOSK_OWN_SECTIONS } from '@/lib/config-layers';
import { appendRevision } from './kiosk-config';
import { orgDefaults } from './config-sources';
import { stockOrg } from './organizations';

/**
 * Kiosk stock (คลังตู้) → customer and back. A kiosk only moves while it is not registered
 * (never paired, or reset and locked): the customer then registers it with a key from the
 * platform. Sales, orders and settings history stay with the account they happened in.
 */

export const MoveKioskInput = z.object({
  kioskRowId: z.string().min(1).max(32),
  branchId: z.string().min(1, 'เลือกสาขา').max(32)
});

const MOVABLE = ['pending', 'revoked'] as const;

function assertManage(ctx: PlatformContext) {
  if (!canPlatform(ctx.user.platformRole, 'platform.org.manage')) throw forbidden();
}

async function liveCount(orgId: string) {
  return (await db().select({ id: kiosks.id }).from(kiosks).where(and(eq(kiosks.orgId, orgId), inArray(kiosks.status, ['pending', 'active', 'disabled'])))).length;
}

/** Kiosks in stock, with whether they can be given to a customer right now. */
export async function listStockKiosks() {
  const stock = await stockOrg();
  const rows = await db().select().from(kiosks).where(eq(kiosks.orgId, stock.id)).orderBy(kiosks.name);
  return rows.map((k) => ({ kiosk: k, movable: (MOVABLE as readonly string[]).includes(k.status) }));
}

/**
 * Moves a kiosk to `toOrgId` (a customer, or the stock). Its settings start again from the
 * target's ค่ากลาง; earlier revisions stay with the previous account.
 */
export async function moveKiosk(ctx: PlatformContext, toOrgId: string, input: z.infer<typeof MoveKioskInput>) {
  assertManage(ctx);
  const kiosk = (await db().select().from(kiosks).where(eq(kiosks.id, input.kioskRowId)).limit(1))[0];
  if (!kiosk) throw notFound('ตู้');
  if (!(MOVABLE as readonly string[]).includes(kiosk.status)) {
    throw new AppError('ตู้นี้ลงทะเบียนอยู่ กด "รีเซ็ตและล็อกตู้" ก่อน แล้วจึงย้าย', 'conflict');
  }
  const target = (await db().select().from(organizations).where(and(eq(organizations.id, toOrgId), isNull(organizations.deletedAt))).limit(1))[0];
  if (!target) throw notFound('ลูกค้า');
  if (target.id === kiosk.orgId) return { moved: false };
  const branch = (await db().select().from(branches).where(and(eq(branches.id, input.branchId), eq(branches.orgId, target.id), eq(branches.isActive, true))).limit(1))[0];
  if (!branch) throw new AppError('ไม่พบสาขานี้ของลูกค้า');
  if (target.kind === 'customer' && isFull(await liveCount(target.id), target.kioskQuota)) {
    throw new AppError(`ลูกค้ามีตู้ครบ ${target.kioskQuota} เครื่องตามโควตาแล้ว เพิ่มโควตาได้ที่แท็บ "ขีดจำกัดและสิทธิ์"`, 'conflict');
  }

  const from = kiosk.orgId;
  await db().transaction(async (tx) => {
    const now = new Date();
    await tx.update(kioskPairCodes).set({ expiresAt: now }).where(and(eq(kioskPairCodes.kioskRowId, kiosk.id), isNull(kioskPairCodes.usedAt)));
    await tx
      .update(kiosks)
      .set({
        orgId: target.id,
        branchId: branch.id,
        status: 'pending',
        eventId: null,
        ownSections: NEW_KIOSK_OWN_SECTIONS,
        appliedRevision: null,
        manifestRevision: null,
        configError: null,
        emergency: null,
        maintenance: false,
        disabledReason: null,
        disabledAt: null
      })
      .where(eq(kiosks.id, kiosk.id));
    // A kiosk that was registered before starts from the new account's defaults; one that never
    // paired gets revision 1 at pairing as usual
    if (kiosk.currentRevision > 0) {
      const { settings } = await orgDefaults(target.id);
      settings.identity = { ...settings.identity, name: kiosk.name, location: '' };
      await appendRevision(tx, { id: kiosk.id, orgId: target.id }, kiosk.currentRevision, settings, target.kind === 'stock' ? 'คืนเข้าคลังตู้' : `มอบให้ ${target.name}`, ctx.user.id);
    }
  });
  const entry = { action: 'kiosk.move', resourceType: 'kiosk', resourceId: kiosk.id, before: { orgId: from }, after: { orgId: target.id, branchId: branch.id } };
  await audit({ user: ctx.user, orgId: from }, entry);
  await audit({ user: ctx.user, orgId: target.id }, entry);
  return { moved: true, orgKind: target.kind };
}
