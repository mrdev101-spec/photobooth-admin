import { NextResponse, type NextRequest } from 'next/server';
import { authenticateKiosk } from '@/server/kiosk-api/auth';
import { kioskRoute } from '@/server/kiosk-api/http';
import { handlePaymentState } from '@/server/kiosk-api/payments';

export const dynamic = 'force-dynamic';

/** GET /kiosk/payments/{id} — paid yet? (webhook result, or Stripe asked directly as a fallback) */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return kioskRoute(async (r) => NextResponse.json(await handlePaymentState(await authenticateKiosk(r), id)))(req);
}
