import 'server-only';
import { eq } from 'drizzle-orm';
import type { HeartbeatData, HeartbeatResponse } from '@photobooth/contracts';
import { db } from '@/server/db/client';
import { branches, kiosks } from '@/server/db/schema';
import { manifestRevision } from '@/server/services/catalog';
import type { KioskAuth } from './auth';

/**
 * POST /kiosk/heartbeat (every 60 s): stores the kiosk's live status and answers with what
 * the kiosk should do next. Commands arrive in Phase 5; the list is empty until then.
 */
export async function recordHeartbeat(auth: KioskAuth, data: HeartbeatData, ip: string): Promise<HeartbeatResponse> {
  const { kiosk, org } = auth;
  const now = new Date();

  // A different machine using this kiosk's token (e.g. a copied data folder, or a replaced PC)
  const mismatch = !!data.fingerprint && !!kiosk.fingerprint && data.fingerprint !== kiosk.fingerprint;

  await db()
    .update(kiosks)
    .set({
      lastSeenAt: now,
      mode: data.mode,
      screen: data.screen || null,
      // Monotonic: the Admin only ever publishes newer revisions (rollback = new revision)
      ...(data.revision > (kiosk.appliedRevision ?? 0) && data.revision <= kiosk.currentRevision ? { appliedRevision: data.revision } : {}),
      appVersion: data.appVersion || kiosk.appVersion,
      ip: data.ip || ip,
      hostname: data.hostname ?? kiosk.hostname,
      queueDepth: data.queueDepth,
      printerState: data.printers,
      cameraState: data.camera ?? null,
      ...(data.localSettings ? { localSettings: data.localSettings } : {}),
      emergency: data.emergency ?? null,
      ...(data.fingerprint ? { reportedFingerprint: data.fingerprint } : {}),
      // Stays flagged until someone accepts the new machine in the Admin
      ...(mismatch ? { fingerprintMismatch: true } : {})
    })
    .where(eq(kiosks.id, kiosk.id));

  // One key = one machine: another machine using this kiosk's token is closed until the
  // platform accepts it (or issues a new key)
  const otherMachine = mismatch || kiosk.fingerprintMismatch;
  const branch = kiosk.branchId ? (await db().select({ name: branches.name }).from(branches).where(eq(branches.id, kiosk.branchId)).limit(1))[0] : undefined;
  return {
    serverTime: now.toISOString(),
    latestRevision: kiosk.currentRevision,
    manifestRevision: await manifestRevision(),
    maintenance: kiosk.maintenance,
    suspended: org.status !== 'active',
    disabled: kiosk.status === 'disabled' || otherMachine,
    disabledMessage: otherMachine
      ? 'เครื่องนี้ไม่ตรงกับเครื่องที่ลงทะเบียนไว้ กรุณาติดต่อผู้ให้บริการ'
      : kiosk.status === 'disabled'
        ? 'ตู้ปิดใช้งานชั่วคราว กรุณาติดต่อผู้ให้บริการ'
        : null,
    account: { org: org.name, stock: org.kind === 'stock', kiosk: kiosk.name, branch: branch?.name ?? null },
    commands: []
  };
}
