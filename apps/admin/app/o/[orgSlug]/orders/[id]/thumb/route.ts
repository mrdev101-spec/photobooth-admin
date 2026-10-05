import { and, eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { getOrgContext } from '@/server/auth/context';
import { can } from '@/server/auth/rbac';
import { db } from '@/server/db/client';
import { orderThumbs, orders } from '@/server/db/schema';

/** The order's small JPEG (Event Console). Customer photos: only for signed-in users of this shop. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ orgSlug: string; id: string }> }) {
  const { orgSlug, id } = await params;
  const ctx = await getOrgContext(orgSlug).catch(() => null);
  if (!ctx || !(can(ctx.principal, 'order.view') || can(ctx.principal, 'console.view'))) return new Response('Not found', { status: 404 });
  const row = (
    await db()
      .select({ jpeg: orderThumbs.jpeg, branchId: orders.branchId })
      .from(orderThumbs)
      .innerJoin(orders, eq(orders.id, orderThumbs.orderId))
      .where(and(eq(orderThumbs.orderId, id), eq(orderThumbs.orgId, ctx.org.id)))
      .limit(1)
  )[0];
  if (!row || !(can(ctx.principal, 'order.view', { branchId: row.branchId }) || can(ctx.principal, 'console.view', { branchId: row.branchId }))) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(row.jpeg), {
    headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff' }
  });
}
