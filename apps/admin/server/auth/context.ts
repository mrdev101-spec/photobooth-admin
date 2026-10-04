import 'server-only';
import { cache } from 'react';
import { notFound, redirect } from 'next/navigation';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { membershipBranches, memberships, organizations, type Organization } from '@/server/db/schema';
import { can, canPlatform, type OrgAction, type PlatformAction, type Principal } from './rbac';
import { getSessionUser, type SessionUser } from './session';
import { forbidden } from '@/server/lib/errors';

/**
 * Request context. Every service that touches customer data takes an OrgContext, and the
 * org id always comes from here (the signed-in user's membership), never from form input.
 */
export interface OrgContext {
  user: SessionUser;
  org: Organization;
  principal: Principal;
  /** A platform user working inside a customer's space (support access). */
  actingAsPlatform: boolean;
}

export interface PlatformContext {
  user: SessionUser & { platformRole: NonNullable<SessionUser['platformRole']> };
}

/** Signed-in user or redirect to /login; also forces the first-login password change. */
export async function requireUser(opts: { allowPasswordChange?: boolean } = {}): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.mustChangePassword && !opts.allowPasswordChange) redirect('/change-password');
  return user;
}

export async function requirePlatform(action: PlatformAction = 'platform.view'): Promise<PlatformContext> {
  const user = await requireUser();
  if (!user.platformRole || !canPlatform(user.platformRole, action)) notFound();
  return { user: user as PlatformContext['user'] };
}

export const getOrgContext = cache(async (slug: string): Promise<OrgContext> => {
  const user = await requireUser();
  const org = (
    await db()
      .select()
      .from(organizations)
      .where(and(eq(organizations.slug, slug), isNull(organizations.deletedAt)))
      .limit(1)
  )[0];
  if (!org) notFound();

  const membership = (
    await db()
      .select()
      .from(memberships)
      .where(and(eq(memberships.orgId, org.id), eq(memberships.userId, user.id)))
      .limit(1)
  )[0];

  // Customers only see their own organizations; 404 (not 403) so slugs don't leak
  if (!membership && !user.platformRole) notFound();
  if (org.status === 'suspended' && !user.platformRole) redirect('/suspended');

  let branches: Principal['branches'] = 'all';
  if (membership && !membership.allBranches) {
    const rows = await db()
      .select({ branchId: membershipBranches.branchId })
      .from(membershipBranches)
      .where(and(eq(membershipBranches.orgId, org.id), eq(membershipBranches.userId, user.id)));
    branches = rows.map((r) => r.branchId);
  }

  return {
    user,
    org,
    principal: { platformRole: user.platformRole ?? null, orgRole: membership?.role ?? null, branches },
    actingAsPlatform: !membership
  };
});

/**
 * OrgContext for the Platform Console acting on one customer (by id, not slug), so platform
 * pages reuse the same tenant-scoped services customers use. Always "acting as platform".
 */
export async function orgContextForPlatform(ctx: PlatformContext, orgId: string): Promise<OrgContext> {
  const org = (
    await db()
      .select()
      .from(organizations)
      .where(and(eq(organizations.id, orgId), isNull(organizations.deletedAt)))
      .limit(1)
  )[0];
  if (!org) notFound();
  return { user: ctx.user, org, principal: { platformRole: ctx.user.platformRole, orgRole: null, branches: 'all' }, actingAsPlatform: true };
}

/** Throws AppError('forbidden') when the context may not perform the action. */
export function assertCan(ctx: OrgContext, action: OrgAction, scope?: { branchId?: string | null }): void {
  if (!can(ctx.principal, action, scope)) throw forbidden();
}

/** Page guard: 404 when the user cannot open the page at all. */
export async function requireOrg(slug: string, action: OrgAction = 'org.view'): Promise<OrgContext> {
  const ctx = await getOrgContext(slug);
  if (!can(ctx.principal, action)) notFound();
  return ctx;
}
