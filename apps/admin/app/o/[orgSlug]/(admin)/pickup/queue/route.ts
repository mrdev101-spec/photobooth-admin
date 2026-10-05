import { NextResponse, type NextRequest } from 'next/server';
import { getOrgContext } from '@/server/auth/context';
import { can } from '@/server/auth/rbac';
import { pickupQueue } from '@/server/services/orders';
import { toCounterOrder } from '../serialize';

export const dynamic = 'force-dynamic';

/** GET — the pickup counter polls this every few seconds (signed-in session, pickup.use). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const ctx = await getOrgContext(orgSlug);
  if (!can(ctx.principal, 'pickup.use')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  // ?event=<id>: only that event's orders (Event Studio)
  const q = await pickupQueue(ctx, { eventId: req.nextUrl.searchParams.get('event') });
  return NextResponse.json(
    { serverTime: new Date().toISOString(), waiting: q.waiting.map((o) => toCounterOrder(o, orgSlug)), recent: q.recent.map((o) => toCounterOrder(o, orgSlug)) },
    { headers: { 'cache-control': 'no-store' } }
  );
}
