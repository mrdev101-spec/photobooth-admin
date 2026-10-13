import { NextResponse } from 'next/server';
import { sealSecrets } from '@photobooth/contracts/node';
import { authenticateKiosk } from '@/server/kiosk-api/auth';
import { kioskRoute } from '@/server/kiosk-api/http';
import { kioskPaymentFallback } from '@/server/services/payments';

export const dynamic = 'force-dynamic';

/**
 * GET /kiosk/payments/fallback — the restricted Stripe key the kiosk keeps for selling while the
 * Admin is unreachable, sealed to this request's device token (useless to anyone else).
 */
export const GET = kioskRoute(async (req) => {
  const auth = await authenticateKiosk(req);
  const stripe = await kioskPaymentFallback(auth);
  return NextResponse.json({ sealed: stripe ? sealSecrets({ version: 0, r2: null, stripe }, auth.token) : null });
});
