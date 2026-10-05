import { NextResponse, type NextRequest } from 'next/server';
import { getOrgContext } from '@/server/auth/context';
import { can } from '@/server/auth/rbac';
import { consoleFeed } from '@/server/services/event-console';

export const dynamic = 'force-dynamic';

/** GET …/console/feed?event=&kiosk= — what the Event Console shows, read every few seconds. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const ctx = await getOrgContext(orgSlug).catch(() => null);
  if (!ctx || !can(ctx.principal, 'console.view')) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const sp = req.nextUrl.searchParams;
  const feed = await consoleFeed(ctx, { eventId: sp.get('event') || null, kioskId: sp.get('kiosk') || null });
  return NextResponse.json(feed, { headers: { 'Cache-Control': 'no-store' } });
}
