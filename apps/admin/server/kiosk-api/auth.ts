import 'server-only';
import type { NextRequest } from 'next/server';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { kioskTokens, kiosks, organizations, type Kiosk, type Organization } from '@/server/db/schema';
import { sha256Hex } from '@/server/lib/crypto';
import { rateLimit } from '@/server/lib/rate-limit';
import { KioskApiError } from './http';

export interface KioskAuth {
  kiosk: Kiosk;
  org: Organization;
  tokenId: string;
  /** The raw device token of this request (only used to seal secrets back to this kiosk). */
  token: string;
}

const REQUESTS_PER_MINUTE = 120;
const TOUCH_TOKEN_EVERY_MS = 10 * 60_000;

/**
 * `Authorization: Bearer <deviceToken>` → the kiosk and its organization. The org always
 * comes from the token; nothing in the request body can choose it.
 */
export async function authenticateKiosk(req: NextRequest): Promise<KioskAuth> {
  const header = req.headers.get('authorization') ?? '';
  const token = /^Bearer\s+(\S+)$/i.exec(header)?.[1];
  if (!token || token.length > 200) throw new KioskApiError('AD0001', 401);

  const row = (
    await db()
      .select({ tokenId: kioskTokens.id, lastUsedAt: kioskTokens.lastUsedAt, kiosk: kiosks, org: organizations })
      .from(kioskTokens)
      .innerJoin(kiosks, eq(kiosks.id, kioskTokens.kioskRowId))
      .innerJoin(organizations, eq(organizations.id, kiosks.orgId))
      .where(and(eq(kioskTokens.tokenHash, sha256Hex(token)), isNull(kioskTokens.revokedAt), inArray(kiosks.status, ['active', 'disabled']), isNull(organizations.deletedAt)))
      .limit(1)
  )[0];
  if (!row) {
    // A token the platform revoked (reset / moved): the kiosk locks itself until a new key
    const revoked = (await db().select({ id: kioskTokens.id }).from(kioskTokens).where(eq(kioskTokens.tokenHash, sha256Hex(token))).limit(1))[0];
    throw new KioskApiError(revoked ? 'AD0013' : 'AD0001', 401);
  }

  // A copied data folder on another machine would present someone else's Kiosk ID header
  const claimed = req.headers.get('x-kiosk-id');
  if (claimed && claimed !== row.kiosk.kioskId) throw new KioskApiError('AD0001', 401, 'Kiosk ID ไม่ตรงกับการเชื่อมต่อ');

  if (!(await rateLimit(`k:${row.kiosk.id}`, REQUESTS_PER_MINUTE, 60))) throw new KioskApiError('AD0011', 429);

  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > TOUCH_TOKEN_EVERY_MS) {
    await db().update(kioskTokens).set({ lastUsedAt: new Date() }).where(eq(kioskTokens.id, row.tokenId));
  }
  return { kiosk: row.kiosk, org: row.org, tokenId: row.tokenId, token };
}

/** For endpoints that serve customers (payments, orders, AI): a disabled kiosk gets AD0005. */
export function assertKioskServing(auth: KioskAuth): void {
  if (auth.kiosk.status === 'disabled') throw new KioskApiError('AD0005', 403, 'ตู้นี้ถูกปิดใช้งานโดยผู้ให้บริการ');
  if (auth.org.status !== 'active') throw new KioskApiError('AD0005', 403, 'บัญชีลูกค้าถูกระงับ');
}
