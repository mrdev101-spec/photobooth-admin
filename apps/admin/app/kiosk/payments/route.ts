import { NextResponse } from 'next/server';
import { PaymentCreateSchema } from '@photobooth/contracts';
import { authenticateKiosk } from '@/server/kiosk-api/auth';
import { kioskRoute, readJson } from '@/server/kiosk-api/http';
import { handlePaymentCreate } from '@/server/kiosk-api/payments';

export const dynamic = 'force-dynamic';

/** POST /kiosk/payments — PromptPay QR for one sale; the kiosk polls GET /kiosk/payments/{id}. */
export const POST = kioskRoute(async (req) => {
  const auth = await authenticateKiosk(req);
  return NextResponse.json(await handlePaymentCreate(auth, PaymentCreateSchema.parse(await readJson(req))), { status: 201 });
});
