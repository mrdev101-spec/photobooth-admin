import { and, eq, inArray, type SQL } from 'drizzle-orm';
import type { MySqlColumn } from 'drizzle-orm/mysql-core';
import type { OrgContext } from '@/server/auth/context';

/**
 * Tenant scoping helpers. Every query on a customer-owned table must go through `orgWhere`
 * so the org id comes from the request context, never from user input:
 *
 *   db().select().from(branches).where(orgWhere(ctx, branches.orgId, eq(branches.id, id)))
 */
export function orgWhere(ctx: Pick<OrgContext, 'org'>, orgColumn: MySqlColumn, ...conditions: (SQL | undefined)[]): SQL {
  return and(eq(orgColumn, ctx.org.id), ...conditions)!;
}

/**
 * Limits a query to the branches the user may see (managers / pickup staff can be limited
 * to some branches). Returns undefined when the user sees every branch.
 */
export function branchWhere(ctx: Pick<OrgContext, 'principal'>, branchColumn: MySqlColumn): SQL | undefined {
  const { branches, platformRole } = ctx.principal;
  if (platformRole || branches === 'all') return undefined;
  // No branches assigned: match nothing rather than everything
  return branches.length ? inArray(branchColumn, [...branches]) : eq(branchColumn, '__none__');
}
