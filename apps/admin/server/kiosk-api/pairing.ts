import 'server-only';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { defaultKioskSettings, withSettingsDefaults, type PairResponse, type PairRequestSchema } from '@photobooth/contracts';
import { NEW_KIOSK_OWN_SECTIONS } from '@/lib/config-layers';
import type { z } from 'zod';
import { db } from '@/server/db/client';
import { branches, kioskConfigRevisions, kioskPairCodes, kioskTokens, kiosks, orgConfigDefaults, organizations } from '@/server/db/schema';
import { randomToken, sha256Hex } from '@/server/lib/crypto';
import { newId } from '@/server/lib/ids';
import { isDuplicateKey } from '@/server/lib/errors';
import { rateLimit } from '@/server/lib/rate-limit';
import { KioskApiError } from './http';
import type { KioskAuth } from './auth';

// Codes are 8 chars over 30 symbols (~6.5e11); this cap makes guessing hopeless
const PAIR_ATTEMPTS_PER_IP = 20;
const PAIR_WINDOW_SEC = 15 * 60;

/**
 * POST /kiosk/pair: exchanges a one-time pairing code for a device token.
 * Binds the kiosk's own Kiosk ID + fingerprint to the pending kiosk row and creates
 * config revision 1 (the kiosk's DEFAULT_CONFIG values) on the first pairing.
 */
export async function pairKiosk(input: z.output<typeof PairRequestSchema>, ip: string): Promise<PairResponse> {
  if (!(await rateLimit(`pair:${ip}`, PAIR_ATTEMPTS_PER_IP, PAIR_WINDOW_SEC))) throw new KioskApiError('AD0011', 429);

  const now = new Date();
  const found = (
    await db()
      .select({ code: kioskPairCodes, kiosk: kiosks, org: organizations })
      .from(kioskPairCodes)
      .innerJoin(kiosks, eq(kiosks.id, kioskPairCodes.kioskRowId))
      .innerJoin(organizations, eq(organizations.id, kioskPairCodes.orgId))
      .where(and(eq(kioskPairCodes.codeHash, sha256Hex(input.pairCode)), isNull(kioskPairCodes.usedAt), gt(kioskPairCodes.expiresAt, now)))
      .limit(1)
  )[0];
  if (!found || found.kiosk.status !== 'pending') throw new KioskApiError('AD0002', 400);
  if (found.org.status !== 'active' || found.org.deletedAt) throw new KioskApiError('AD0005', 403, 'บัญชีลูกค้าถูกระงับ');

  const other = (await db().select({ id: kiosks.id }).from(kiosks).where(eq(kiosks.kioskId, input.kioskId)).limit(1))[0];
  if (other && other.id !== found.kiosk.id) throw new KioskApiError('AD0004', 409);

  const token = randomToken();
  const kioskRowId = found.kiosk.id;
  let revision = found.kiosk.currentRevision;

  try {
    await db().transaction(async (tx) => {
      // Single use, even when two kiosks race with the same code
      const [used] = await tx
        .update(kioskPairCodes)
        .set({ usedAt: now })
        .where(and(eq(kioskPairCodes.id, found.code.id), isNull(kioskPairCodes.usedAt)));
      if (used.affectedRows !== 1) throw new KioskApiError('AD0002', 400);

      await tx.update(kioskTokens).set({ revokedAt: now }).where(and(eq(kioskTokens.kioskRowId, kioskRowId), isNull(kioskTokens.revokedAt)));
      await tx.insert(kioskTokens).values({ id: newId('ktk'), orgId: found.org.id, kioskRowId, tokenHash: sha256Hex(token) });

      if (revision === 0) {
        // Revision 1: the customer's defaults (ค่ากลาง), or the kiosk's own defaults when none are saved
        const saved = (await tx.select({ settings: orgConfigDefaults.settings }).from(orgConfigDefaults).where(eq(orgConfigDefaults.orgId, found.org.id)).limit(1))[0];
        const settings = saved ? withSettingsDefaults(saved.settings) : defaultKioskSettings();
        settings.identity = { ...settings.identity, name: found.kiosk.name, location: '' };
        await tx.insert(kioskConfigRevisions).values({ kioskRowId, revision: 1, orgId: found.org.id, settings, note: 'ค่าเริ่มต้นเมื่อจับคู่ตู้' });
        revision = 1;
      }

      await tx
        .update(kiosks)
        .set({
          status: 'active',
          kioskId: input.kioskId,
          fingerprint: input.fingerprint,
          reportedFingerprint: input.fingerprint,
          fingerprintMismatch: false,
          hostname: input.hostname || null,
          appVersion: input.appVersion || null,
          ip,
          currentRevision: revision,
          ...(found.kiosk.currentRevision === 0 && found.kiosk.ownSections == null ? { ownSections: NEW_KIOSK_OWN_SECTIONS } : {}),
          pairedAt: now,
          revokedAt: null
        })
        .where(eq(kiosks.id, kioskRowId));
    });
  } catch (err) {
    if (isDuplicateKey(err)) throw new KioskApiError('AD0004', 409); // same Kiosk ID paired concurrently
    throw err;
  }

  const branch = found.kiosk.branchId
    ? ((await db().select({ id: branches.id, name: branches.name }).from(branches).where(eq(branches.id, found.kiosk.branchId)).limit(1))[0] ?? null)
    : null;

  return { deviceToken: token, kioskId: input.kioskId, name: found.kiosk.name, org: { name: found.org.name }, branch, revision };
}

/**
 * The kiosk unpaired itself (Config › ยกเลิกการเชื่อมต่อ): the same as the Admin's unpair — the
 * token stops working and its Kiosk ID is released (kept in former_kiosk_id), so the machine can
 * be registered again with a new pairing code or key, to this kiosk or another one.
 */
export async function unpairSelf(auth: KioskAuth): Promise<void> {
  const k = auth.kiosk;
  const now = new Date();
  await db().transaction(async (tx) => {
    await tx.update(kioskTokens).set({ revokedAt: now }).where(and(eq(kioskTokens.kioskRowId, k.id), isNull(kioskTokens.revokedAt)));
    await tx.update(kioskPairCodes).set({ expiresAt: now }).where(and(eq(kioskPairCodes.kioskRowId, k.id), isNull(kioskPairCodes.usedAt)));
    await tx
      .update(kiosks)
      .set({
        status: 'revoked',
        kioskId: null,
        formerKioskId: k.kioskId ?? k.formerKioskId,
        revokedAt: now,
        fingerprintMismatch: false,
        appliedRevision: null,
        manifestRevision: null,
        emergency: null,
        maintenance: false
      })
      .where(eq(kiosks.id, k.id));
  });
}
