import 'server-only';
import { and, desc, eq, isNull, lt } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { auditLogs, users } from '@/server/db/schema';
import { assertCan, type OrgContext } from '@/server/auth/context';
import { orgWhere } from '@/server/tenancy/scoped';

const PAGE = 50;

const columns = {
  id: auditLogs.id,
  at: auditLogs.at,
  action: auditLogs.action,
  resourceType: auditLogs.resourceType,
  resourceId: auditLogs.resourceId,
  before: auditLogs.before,
  after: auditLogs.after,
  ip: auditLogs.ip,
  actingAsPlatform: auditLogs.actingAsPlatform,
  orgId: auditLogs.orgId,
  userName: users.name,
  userEmail: users.email
};

/** Newest first; `before` is the id of the last row of the previous page (ULIDs sort by time). */
export async function listOrgAudit(ctx: OrgContext, before?: string) {
  assertCan(ctx, 'audit.view');
  return db()
    .select(columns)
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.userId))
    .where(orgWhere(ctx, auditLogs.orgId, before ? lt(auditLogs.id, before) : undefined))
    .orderBy(desc(auditLogs.id))
    .limit(PAGE);
}

/** Platform audit: platform-level actions, or everything for one organization. */
export async function listPlatformAudit(opts: { orgId?: string; before?: string } = {}) {
  return db()
    .select(columns)
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.userId))
    .where(and(opts.orgId ? eq(auditLogs.orgId, opts.orgId) : isNull(auditLogs.orgId), opts.before ? lt(auditLogs.id, opts.before) : undefined))
    .orderBy(desc(auditLogs.id))
    .limit(PAGE);
}

export const AUDIT_PAGE_SIZE = PAGE;
