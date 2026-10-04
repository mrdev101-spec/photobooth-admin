import 'server-only';
import { eq } from 'drizzle-orm';
import type { HeartbeatData, HeartbeatResponse } from '@photobooth/contracts';
import { db } from '@/server/db/client';
import { kiosks } from '@/server/db/schema';
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
      ...(data.fingerprint ? { reportedFingerprint: data.fingerprint } : {}),
      // Stays flagged until someone accepts the new machine in the Admin
      ...(mismatch ? { fingerprintMismatch: true } : {})
    })
    .where(eq(kiosks.id, kiosk.id));

  return {
    serverTime: now.toISOString(),
    latestRevision: kiosk.currentRevision,
    manifestRevision: await manifestRevision(),
    maintenance: kiosk.maintenance,
    suspended: org.status !== 'active',
    disabled: kiosk.status === 'disabled',
    disabledMessage: kiosk.status === 'disabled' ? 'ตู้ปิดใช้งานชั่วคราว กรุณาติดต่อผู้ให้บริการ' : null,
    commands: []
  };
}
