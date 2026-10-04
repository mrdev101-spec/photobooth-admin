import 'server-only';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/server/db/client';
import { branches } from '@/server/db/schema';
import { assertCan, type OrgContext } from '@/server/auth/context';
import { orgWhere } from '@/server/tenancy/scoped';
import { audit } from '@/server/audit';
import { newId } from '@/server/lib/ids';
import { notFound } from '@/server/lib/errors';

export const BranchInput = z.object({
  name: z.string().trim().min(1, 'กรอกชื่อสาขา').max(120),
  address: z.string().trim().max(500).default('')
});

export async function listBranches(ctx: OrgContext) {
  assertCan(ctx, 'branch.view');
  return db().select().from(branches).where(orgWhere(ctx, branches.orgId)).orderBy(branches.name);
}

async function getBranch(ctx: OrgContext, id: string) {
  const b = (await db().select().from(branches).where(orgWhere(ctx, branches.orgId, eq(branches.id, id))).limit(1))[0];
  if (!b) throw notFound('สาขา');
  return b;
}

export async function createBranch(ctx: OrgContext, input: z.infer<typeof BranchInput>) {
  assertCan(ctx, 'branch.manage');
  const id = newId('brn');
  await db().insert(branches).values({ id, orgId: ctx.org.id, name: input.name, address: input.address });
  await audit({ user: ctx.user, orgId: ctx.org.id, actingAsPlatform: ctx.actingAsPlatform }, {
    action: 'branch.create',
    resourceType: 'branch',
    resourceId: id,
    after: input
  });
  return id;
}

export async function updateBranch(ctx: OrgContext, id: string, input: z.infer<typeof BranchInput>) {
  assertCan(ctx, 'branch.manage');
  const before = await getBranch(ctx, id);
  await db().update(branches).set(input).where(orgWhere(ctx, branches.orgId, eq(branches.id, id)));
  await audit({ user: ctx.user, orgId: ctx.org.id, actingAsPlatform: ctx.actingAsPlatform }, {
    action: 'branch.update',
    resourceType: 'branch',
    resourceId: id,
    before: { name: before.name, address: before.address },
    after: input
  });
}

/** Branches are deactivated, not deleted: kiosks, orders and reports keep pointing at them. */
export async function setBranchActive(ctx: OrgContext, id: string, isActive: boolean) {
  assertCan(ctx, 'branch.manage');
  const before = await getBranch(ctx, id);
  await db().update(branches).set({ isActive }).where(orgWhere(ctx, branches.orgId, eq(branches.id, id)));
  await audit({ user: ctx.user, orgId: ctx.org.id, actingAsPlatform: ctx.actingAsPlatform }, {
    action: isActive ? 'branch.reactivate' : 'branch.deactivate',
    resourceType: 'branch',
    resourceId: id,
    before: { isActive: before.isActive },
    after: { isActive }
  });
}
