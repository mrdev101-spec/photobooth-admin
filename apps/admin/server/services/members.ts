import 'server-only';
import { and, count, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/server/db/client';
import { branches, membershipBranches, memberships, ORG_ROLES, users } from '@/server/db/schema';
import { assertCan, type OrgContext } from '@/server/auth/context';
import { hashPassword } from '@/server/auth/password';
import { destroyAllSessions } from '@/server/auth/session';
import { orgWhere } from '@/server/tenancy/scoped';
import { audit } from '@/server/audit';
import { temporaryPassword } from '@/server/lib/crypto';
import { newId } from '@/server/lib/ids';
import { AppError, isDuplicateKey, notFound } from '@/server/lib/errors';
import { normalizeEmail } from './accounts';
import { isFull } from '@/lib/quota';

const access = {
  role: z.enum(ORG_ROLES),
  allBranches: z.boolean(),
  branchIds: z.array(z.string().max(32)).max(500)
};
const needsBranch = (v: { allBranches: boolean; branchIds: string[] }) => v.allBranches || v.branchIds.length > 0;
const needsBranchMsg = { path: ['branchIds'], message: 'เลือกอย่างน้อย 1 สาขา หรือเลือก "ทุกสาขา"' };

export const MemberInput = z
  .object({
    email: z.email('อีเมลไม่ถูกต้อง'),
    name: z.string().trim().min(1, 'กรอกชื่อ').max(120),
    ...access
  })
  .refine(needsBranch, needsBranchMsg);

export const MemberUpdateInput = z.object(access).refine(needsBranch, needsBranchMsg);

/**
 * Accounts are shared across organizations (one person can belong to several customers).
 * A new account gets a temporary password that must be changed on first sign-in; there is
 * no email in v1, so the admin hands it over.
 */
export async function findOrCreateUser(input: { email: string; name: string }): Promise<{ userId: string; tempPassword: string | null }> {
  const email = normalizeEmail(input.email);
  const existing = (await db().select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1))[0];
  if (existing) return { userId: existing.id, tempPassword: null };

  const tempPassword = temporaryPassword();
  const userId = newId('usr');
  try {
    await db().insert(users).values({ id: userId, email, name: input.name, passwordHash: await hashPassword(tempPassword), mustChangePassword: true });
  } catch (err) {
    // Created concurrently by someone else: use that account
    if (isDuplicateKey(err)) return findOrCreateUser(input);
    throw err;
  }
  return { userId, tempPassword };
}

export async function listMembers(ctx: OrgContext) {
  assertCan(ctx, 'member.view');
  const rows = await db()
    .select({
      userId: users.id,
      email: users.email,
      name: users.name,
      role: memberships.role,
      allBranches: memberships.allBranches,
      lastLoginAt: users.lastLoginAt,
      isActive: users.isActive,
      mustChangePassword: users.mustChangePassword
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(orgWhere(ctx, memberships.orgId))
    .orderBy(users.name);
  const limited = await db()
    .select({ userId: membershipBranches.userId, branchId: membershipBranches.branchId })
    .from(membershipBranches)
    .where(orgWhere(ctx, membershipBranches.orgId));
  return rows.map((r) => ({ ...r, branchIds: limited.filter((l) => l.userId === r.userId).map((l) => l.branchId) }));
}

/** Only branches of this organization may be assigned. */
async function checkBranches(ctx: OrgContext, branchIds: string[]): Promise<string[]> {
  const unique = [...new Set(branchIds)];
  if (!unique.length) return [];
  const found = await db().select({ id: branches.id }).from(branches).where(orgWhere(ctx, branches.orgId, inArray(branches.id, unique)));
  if (found.length !== unique.length) throw new AppError('มีสาขาที่ไม่ถูกต้อง');
  return unique;
}

/** Owners can only be added/changed by owners and platform admins. */
function assertRoleChangeAllowed(ctx: OrgContext, role: string) {
  if (role === 'owner' && ctx.principal.orgRole !== 'owner' && ctx.principal.platformRole !== 'platform_admin') {
    throw new AppError('เฉพาะเจ้าของบัญชีเท่านั้นที่เพิ่มเจ้าของคนอื่นได้', 'forbidden');
  }
}

/** Members of the customer vs. the platform-set limit (null = unlimited). */
export async function memberUsage(ctx: OrgContext): Promise<{ used: number; quota: number | null }> {
  const r = await db().select({ n: count() }).from(memberships).where(orgWhere(ctx, memberships.orgId));
  return { used: r[0]?.n ?? 0, quota: ctx.org.userQuota };
}

export async function addMember(ctx: OrgContext, input: z.infer<typeof MemberInput>) {
  assertCan(ctx, 'member.manage');
  assertRoleChangeAllowed(ctx, input.role);
  // The platform team may go over the limit it set itself (e.g. a temporary support account)
  if (!ctx.principal.platformRole) {
    const { used, quota } = await memberUsage(ctx);
    if (isFull(used, quota)) throw new AppError(`บัญชีนี้มีผู้ใช้ครบ ${quota} คนตามที่ผู้ให้บริการกำหนดแล้ว`, 'conflict');
  }
  const branchIds = input.allBranches ? [] : await checkBranches(ctx, input.branchIds);
  const { userId, tempPassword } = await findOrCreateUser(input);

  try {
    await db().transaction(async (tx) => {
      await tx.insert(memberships).values({ orgId: ctx.org.id, userId, role: input.role, allBranches: input.allBranches });
      if (branchIds.length) await tx.insert(membershipBranches).values(branchIds.map((branchId) => ({ orgId: ctx.org.id, userId, branchId })));
    });
  } catch (err) {
    if (isDuplicateKey(err)) throw new AppError('ผู้ใช้นี้เป็นสมาชิกอยู่แล้ว', 'conflict');
    throw err;
  }
  await audit({ user: ctx.user, orgId: ctx.org.id, actingAsPlatform: ctx.actingAsPlatform }, {
    action: 'member.add',
    resourceType: 'user',
    resourceId: userId,
    after: { email: normalizeEmail(input.email), role: input.role, allBranches: input.allBranches, branchIds, newAccount: !!tempPassword }
  });
  return { userId, tempPassword };
}

async function getMembership(ctx: OrgContext, userId: string) {
  const m = (await db().select().from(memberships).where(orgWhere(ctx, memberships.orgId, eq(memberships.userId, userId))).limit(1))[0];
  if (!m) throw notFound('สมาชิก');
  return m;
}

async function ownerCount(ctx: OrgContext): Promise<number> {
  const r = await db().select({ n: count() }).from(memberships).where(orgWhere(ctx, memberships.orgId, eq(memberships.role, 'owner')));
  return r[0]?.n ?? 0;
}

export async function updateMember(ctx: OrgContext, userId: string, input: z.infer<typeof MemberUpdateInput>) {
  assertCan(ctx, 'member.manage');
  const before = await getMembership(ctx, userId);
  if (before.role === 'owner' || input.role === 'owner') assertRoleChangeAllowed(ctx, 'owner');
  if (before.role === 'owner' && input.role !== 'owner' && (await ownerCount(ctx)) <= 1) {
    throw new AppError('ต้องมีเจ้าของบัญชีอย่างน้อย 1 คน');
  }
  const branchIds = input.allBranches ? [] : await checkBranches(ctx, input.branchIds);

  await db().transaction(async (tx) => {
    await tx
      .update(memberships)
      .set({ role: input.role, allBranches: input.allBranches })
      .where(and(eq(memberships.orgId, ctx.org.id), eq(memberships.userId, userId)));
    await tx.delete(membershipBranches).where(and(eq(membershipBranches.orgId, ctx.org.id), eq(membershipBranches.userId, userId)));
    if (branchIds.length) await tx.insert(membershipBranches).values(branchIds.map((branchId) => ({ orgId: ctx.org.id, userId, branchId })));
  });
  await audit({ user: ctx.user, orgId: ctx.org.id, actingAsPlatform: ctx.actingAsPlatform }, {
    action: 'member.update',
    resourceType: 'user',
    resourceId: userId,
    before: { role: before.role, allBranches: before.allBranches },
    after: { role: input.role, allBranches: input.allBranches, branchIds }
  });
}

export async function removeMember(ctx: OrgContext, userId: string) {
  assertCan(ctx, 'member.manage');
  const before = await getMembership(ctx, userId);
  if (before.role === 'owner') {
    assertRoleChangeAllowed(ctx, 'owner');
    if ((await ownerCount(ctx)) <= 1) throw new AppError('ต้องมีเจ้าของบัญชีอย่างน้อย 1 คน');
  }
  if (userId === ctx.user.id) throw new AppError('ลบตัวเองออกจากบัญชีไม่ได้');
  await db().transaction(async (tx) => {
    await tx.delete(membershipBranches).where(and(eq(membershipBranches.orgId, ctx.org.id), eq(membershipBranches.userId, userId)));
    await tx.delete(memberships).where(and(eq(memberships.orgId, ctx.org.id), eq(memberships.userId, userId)));
  });
  await audit({ user: ctx.user, orgId: ctx.org.id, actingAsPlatform: ctx.actingAsPlatform }, {
    action: 'member.remove',
    resourceType: 'user',
    resourceId: userId,
    before: { role: before.role }
  });
}

/**
 * Resets a member's password to a new temporary one. Owners can reset members of their own
 * organization only when the account belongs to no other organization (so one customer
 * cannot take over a person's access to another customer); platform admins can always.
 */
export async function resetMemberPassword(ctx: OrgContext, userId: string): Promise<string> {
  assertCan(ctx, 'member.manage');
  await getMembership(ctx, userId);
  if (ctx.principal.platformRole !== 'platform_admin') {
    if (ctx.principal.orgRole !== 'owner') throw new AppError('เฉพาะเจ้าของบัญชีเท่านั้นที่รีเซ็ตรหัสผ่านได้', 'forbidden');
    const orgs = await db().select({ n: count() }).from(memberships).where(eq(memberships.userId, userId));
    if ((orgs[0]?.n ?? 0) > 1) throw new AppError('ผู้ใช้นี้อยู่ในหลายบัญชี ติดต่อผู้ดูแลแพลตฟอร์มเพื่อรีเซ็ตรหัสผ่าน', 'forbidden');
    const target = (await db().select({ platformRole: users.platformRole }).from(users).where(eq(users.id, userId)).limit(1))[0];
    if (target?.platformRole) throw new AppError('รีเซ็ตรหัสผ่านของทีมแพลตฟอร์มไม่ได้', 'forbidden');
  }
  const tempPassword = temporaryPassword();
  await db()
    .update(users)
    .set({ passwordHash: await hashPassword(tempPassword), mustChangePassword: true, failedLogins: 0, lockedUntil: null })
    .where(eq(users.id, userId));
  await destroyAllSessions(userId);
  await audit({ user: ctx.user, orgId: ctx.org.id, actingAsPlatform: ctx.actingAsPlatform }, {
    action: 'member.password_reset',
    resourceType: 'user',
    resourceId: userId
  });
  return tempPassword;
}
