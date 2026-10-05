import { NextResponse, type NextRequest } from 'next/server';
import { handleStripeWebhook } from '@/server/services/payments';

export const dynamic = 'force-dynamic';

/** POST /webhooks/stripe/{orgId} — a shop's own Stripe account (its own signing secret). */
export async function POST(req: NextRequest, ctx: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await ctx.params;
  if (!/^org_[A-Za-z0-9]+$/.test(orgId)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const [status, body] = await handleStripeWebhook(await req.text(), req.headers.get('stripe-signature'), orgId);
  return NextResponse.json(body, { status });
}
