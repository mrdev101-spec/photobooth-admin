import 'server-only';
import { and, eq, lte } from 'drizzle-orm';
import type { ConfigAckSchema, KioskConfigResponse, KioskSettings } from '@photobooth/contracts';
import { sealSecrets } from '@photobooth/contracts/node';
import type { z } from 'zod';
import { db } from '@/server/db/client';
import { configAcks, kioskConfigRevisions, kiosks } from '@/server/db/schema';
import { newId } from '@/server/lib/ids';
import { kioskSecretsFor } from '@/server/services/storage';
import { getCatalogState, manifestRevision } from '@/server/services/catalog';
import { forKiosk } from '@/lib/template-visibility';
import type { KioskAuth } from './auth';
import { KioskApiError } from './http';

/**
 * GET /kiosk/config?since={rev}. `null` means 304 (the kiosk already has the latest).
 * Secrets are sealed to this request's device token, so they are useless to anyone else.
 */
export async function kioskConfig(auth: KioskAuth, since: number | null): Promise<KioskConfigResponse | null> {
  const { kiosk } = auth;
  if (since != null && since >= kiosk.currentRevision) return null;
  const row = (
    await db()
      .select()
      .from(kioskConfigRevisions)
      .where(and(eq(kioskConfigRevisions.kioskRowId, kiosk.id), eq(kioskConfigRevisions.revision, kiosk.currentRevision)))
      .limit(1)
  )[0];
  if (!row) throw new KioskApiError('AD0000', 500, 'ไม่พบการตั้งค่าของตู้');
  const secrets = await kioskSecretsFor(auth.org.id);
  return {
    kioskId: kiosk.kioskId!,
    revision: row.revision,
    updatedAt: row.createdAt.toISOString(),
    // Retired templates never reach the kiosk, even when the list says "all"; uploaded ones only
    // reach kiosks that download the asset manifest
    settings: forKiosk(row.settings as KioskSettings, await getCatalogState(), { supportsUploaded: kiosk.manifestRevision != null }),
    secrets: secrets ? sealSecrets(secrets, auth.token) : null,
    assets: { manifestRevision: await manifestRevision() }
  };
}

/** POST /kiosk/config/ack: the kiosk applied a revision (at its first screen) or rejected it. */
export async function ackConfig(auth: KioskAuth, ack: z.output<typeof ConfigAckSchema>): Promise<void> {
  const { kiosk, org } = auth;
  const exists = (
    await db()
      .select({ revision: kioskConfigRevisions.revision })
      .from(kioskConfigRevisions)
      .where(and(eq(kioskConfigRevisions.kioskRowId, kiosk.id), eq(kioskConfigRevisions.revision, ack.revision), lte(kioskConfigRevisions.revision, kiosk.currentRevision)))
      .limit(1)
  )[0];
  if (!exists) throw new KioskApiError('AD0003', 422, 'ไม่พบ revision นี้');

  const now = new Date();
  await db().insert(configAcks).values({
    id: newId('ack'),
    orgId: org.id,
    kioskRowId: kiosk.id,
    revision: ack.revision,
    status: ack.status,
    error: ack.error ?? null,
    appliedAt: ack.appliedAt ? new Date(ack.appliedAt) : null
  });

  if (ack.status === 'applied') {
    // Never move backwards if acks arrive out of order
    if ((kiosk.appliedRevision ?? 0) <= ack.revision) {
      await db()
        .update(kiosks)
        .set({ appliedRevision: ack.revision, ...(kiosk.configError && kiosk.configError.revision <= ack.revision ? { configError: null } : {}) })
        .where(eq(kiosks.id, kiosk.id));
    }
  } else {
    await db()
      .update(kiosks)
      .set({ configError: { revision: ack.revision, code: ack.error?.code, message: ack.error?.message ?? '', at: now.toISOString() } })
      .where(eq(kiosks.id, kiosk.id));
  }
}
