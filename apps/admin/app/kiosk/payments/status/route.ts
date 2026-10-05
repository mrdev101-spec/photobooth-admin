import { NextResponse } from 'next/server';
import { authenticateKiosk } from '@/server/kiosk-api/auth';
import { kioskRoute } from '@/server/kiosk-api/http';
import { handlePaymentStatus } from '@/server/kiosk-api/payments';

export const dynamic = 'force-dynamic';

/** GET /kiosk/payments/status — whether the payment screen can show a real PromptPay QR. */
export const GET = kioskRoute(async (req) => NextResponse.json(await handlePaymentStatus(await authenticateKiosk(req))));
