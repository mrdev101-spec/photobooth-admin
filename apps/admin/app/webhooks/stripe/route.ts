import { NextResponse, type NextRequest } from 'next/server';
import { handleStripeWebhook } from '@/server/services/payments';

export const dynamic = 'force-dynamic';

/** POST /webhooks/stripe — the company account (and Stripe Connect events). Signed by Stripe. */
export async function POST(req: NextRequest) {
  const [status, body] = await handleStripeWebhook(await req.text(), req.headers.get('stripe-signature'), null);
  return NextResponse.json(body, { status });
}
