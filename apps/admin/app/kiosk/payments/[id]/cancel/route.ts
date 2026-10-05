import { NextResponse, type NextRequest } from 'next/server';
import { authenticateKiosk } from '@/server/kiosk-api/auth';
import { kioskRoute } from '@/server/kiosk-api/http';
import { handlePaymentCancel } from '@/server/kiosk-api/payments';

export const dynamic = 'force-dynamic';

/** POST /kiosk/payments/{id}/cancel — the customer left or the QR expired: it can never be paid late. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return kioskRoute(async (r) => NextResponse.json(await handlePaymentCancel(await authenticateKiosk(r), id)))(req);
}
