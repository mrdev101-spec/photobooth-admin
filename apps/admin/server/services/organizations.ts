import 'server-only';
import { and, count, desc, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/server/db/client';
import { branches, memberships, organizations, users, type Organization } from '@/server/db/schema';
import type { PlatformContext } from '@/server/auth/context';
import { audit } from '@/server/audit';
import { newId, slugify } from '@/server/lib/ids';
import { AppError, isDuplicateKey, notFound } from '@/server/lib/errors';
import { findOrCreateUser } from './members';
import { resolvePermissions } from '@/lib/config-permissions';

/** Platform-level management of customers (organizations). Platform context only. */

const optionalQuota = z.union([z.literal('').transform(() => null), z.coerce.number().int().min(0).max(1_000_000)]).nullable();

export const OrganizationInput = z.object({
  name: z.string().trim().min(2, 'กรอกชื่อลูกค้า').max(200),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/, 'ใช้ a-z 0-9 และ - เท่านั้น (2-48 ตัว)')
    .optional()
    .or(z.literal('')),
  kioskQuota: optionalQuota,
  userQuota: optionalQuota,
  aiMonthlyQuota: optionalQuota
});

/** Limits and permissions tab (platform only). */
export const LimitsInput = z.object({
  kioskQuota: optionalQuota,
  userQuota: optionalQuota,
  aiMonthlyQuota: optionalQuota,
  templateQuota: optionalQuota,
  customerCanAddKiosks: z.boolean(),
  ownStripeAllowed: z.boolean().default(false),
  configPermissions: z.record(z.string(), z.enum(['edit', 'view', 'hidden']))
});

export const NewOrganizationInput = OrganizationInput.extend({
  ownerEmail: z.email('อีเมลไม่ถูกต้อง'),
  ownerName: z.string().trim().min(1, 'กรอกชื่อเจ้าของบัญชี').max(120)
});

export const STOCK_SLUG = 'platform-stock';
const RESERVED_SLUGS = new Set(['platform', 'login', 'kiosk', 'pickup', 'api', 'admin', 'o', 'webhooks', 'internal', STOCK_SLUG]);

/**
 * The platform's kiosk stock (คลังตู้): an internal account holding kiosks that no customer
 * has yet, so they can pair and be tested like any kiosk. Created on first use.
 */
export async function stockOrg(): Promise<Organization> {
  const find = async () => (await db().select().from(organizations).where(and(eq(organizations.kind, 'stock'), isNull(organizations.deletedAt))).limit(1))[0];
  const found = await find();
  if (found) return found;
  const orgId = newId('org');
  try {
    await db().transaction(async (tx) => {
      await tx.insert(organizations).values({ id: orgId, slug: STOCK_SLUG, name: 'คลังตู้', kind: 'stock', kioskQuota: null, userQuota: 0 });
      await tx.insert(branches).values({ id: newId('brn'), orgId, name: 'คลัง' });
    });
  } catch (err) {
    if (!isDuplicateKey(err)) throw err; // created by a parallel request
  }
  return (await find())!;
}

export async function listOrganizations() {
  return db()
    .select({
      id: organizations.id,
      slug: organizations.slug,
      name: organizations.name,
      status: organizations.status,
      kioskQuota: organizations.kioskQuota,
      aiMonthlyQuota: organizations.aiMonthlyQuota,
      userQuota: organizations.userQuota,
      createdAt: organizations.createdAt,
      members: count(memberships.userId),
      kiosks: sql<number>`(SELECT COUNT(*) FROM kiosks k WHERE k.org_id = ${organizations.id} AND k.status IN ('pending', 'active', 'disabled'))`.mapWith(Number)
    })
    .from(organizations)
    .leftJoin(memberships, eq(memberships.orgId, organizations.id))
    .where(and(isNull(organizations.deletedAt), eq(organizations.kind, 'customer')))
    .groupBy(organizations.id)
    .orderBy(desc(organizations.createdAt));
}

export async function getOrganization(id: string): Promise<Organization> {
  const org = (await db().select().from(organizations).where(and(eq(organizations.id, id), isNull(organizations.deletedAt))).limit(1))[0];
  if (!org) throw notFound('ลูกค้า');
  return org;
}

/**
 * Creates a customer with its first owner and a default branch. Returns the owner's
 * temporary password when a new account was created (shown once, never stored in clear).
 */
export async function createOrganization(ctx: PlatformContext, input: z.infer<typeof NewOrganizationInput>) {
  const slug = input.slug || slugify(input.name);
  if (RESERVED_SLUGS.has(slug)) throw new AppError('slug นี้ใช้ไม่ได้');
  const orgId = newId('org');
  const owner = await findOrCreateUser({ email: input.ownerEmail, name: input.ownerName });

  try {
    await db().transaction(async (tx) => {
      await tx.insert(organizations).values({
        id: orgId,
        slug,
        name: input.name,
        kioskQuota: input.kioskQuota,
        userQuota: input.userQuota,
        aiMonthlyQuota: input.aiMonthlyQuota
      });
      await tx.insert(branches).values({ id: newId('brn'), orgId, name: 'สาขาหลัก' });
      await tx.insert(memberships).values({ orgId, userId: owner.userId, role: 'owner', allBranches: true });
    });
  } catch (err) {
    if (isDuplicateKey(err)) throw new AppError(`slug "${slug}" มีลูกค้าใช้แล้ว`, 'conflict');
    throw err;
  }

  await audit({ user: ctx.user, orgId: null }, {
    action: 'org.create',
    resourceType: 'organization',
    resourceId: orgId,
    after: { name: input.name, slug, kioskQuota: input.kioskQuota, userQuota: input.userQuota, aiMonthlyQuota: input.aiMonthlyQuota, owner: input.ownerEmail }
  });
  return { orgId, slug, ownerTempPassword: owner.tempPassword };
}

export const OrganizationInfoInput = OrganizationInput.pick({ name: true, slug: true });

export async function updateOrganization(ctx: PlatformContext, id: string, input: z.infer<typeof OrganizationInfoInput>) {
  const before = await getOrganization(id);
  const slug = input.slug || before.slug;
  if (RESERVED_SLUGS.has(slug)) throw new AppError('slug นี้ใช้ไม่ได้');
  try {
    await db().update(organizations).set({ name: input.name, slug }).where(eq(organizations.id, id));
  } catch (err) {
    if (isDuplicateKey(err)) throw new AppError(`slug "${slug}" มีลูกค้าใช้แล้ว`, 'conflict');
    throw err;
  }
  await audit({ user: ctx.user, orgId: null }, {
    action: 'org.update',
    resourceType: 'organization',
    resourceId: id,
    before: { name: before.name, slug: before.slug },
    after: { name: input.name, slug }
  });
}

/** Quotas, "customer can add kiosks" and kiosk settings permissions (docs §17.3, §17.4). */
export async function updateLimits(ctx: PlatformContext, id: string, input: z.infer<typeof LimitsInput>) {
  const before = await getOrganization(id);
  const configPermissions = resolvePermissions(input.configPermissions);
  const after = {
    kioskQuota: input.kioskQuota,
    userQuota: input.userQuota,
    aiMonthlyQuota: input.aiMonthlyQuota,
    templateQuota: input.templateQuota,
    customerCanAddKiosks: input.customerCanAddKiosks,
    ownStripeAllowed: input.ownStripeAllowed,
    configPermissions
  };
  await db().update(organizations).set(after).where(eq(organizations.id, id));
  await audit({ user: ctx.user, orgId: id, actingAsPlatform: true }, {
    action: 'org.limits',
    resourceType: 'organization',
    resourceId: id,
    before: {
      kioskQuota: before.kioskQuota,
      userQuota: before.userQuota,
      aiMonthlyQuota: before.aiMonthlyQuota,
      templateQuota: before.templateQuota,
      customerCanAddKiosks: before.customerCanAddKiosks,
      ownStripeAllowed: before.ownStripeAllowed,
      configPermissions: resolvePermissions(before.configPermissions)
    },
    after
  });
}

export async function setOrganizationStatus(ctx: PlatformContext, id: string, status: 'active' | 'suspended') {
  const before = await getOrganization(id);
  if (before.status === status) return;
  await db().update(organizations).set({ status }).where(eq(organizations.id, id));
  await audit({ user: ctx.user, orgId: null }, {
    action: status === 'suspended' ? 'org.suspend' : 'org.reactivate',
    resourceType: 'organization',
    resourceId: id,
    before: { status: before.status },
    after: { status }
  });
}

export async function setLivePaymentsAllowed(ctx: PlatformContext, id: string, allowed: boolean) {
  const before = await getOrganization(id);
  await db().update(organizations).set({ livePaymentsAllowed: allowed }).where(eq(organizations.id, id));
  await audit({ user: ctx.user, orgId: null }, {
    action: 'org.live_payments',
    resourceType: 'organization',
    resourceId: id,
    before: { livePaymentsAllowed: before.livePaymentsAllowed },
    after: { livePaymentsAllowed: allowed }
  });
}

/** Organizations a user belongs to, for the org switcher and the post-login redirect. */
export async function organizationsForUser(userId: string) {
  return db()
    .select({ id: organizations.id, slug: organizations.slug, name: organizations.name, role: memberships.role, status: organizations.status })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.orgId))
    .where(and(eq(memberships.userId, userId), isNull(organizations.deletedAt)))
    .orderBy(organizations.name);
}

/** Members of any organization, for the platform detail page. */
export async function listOrganizationMembers(orgId: string) {
  return db()
    .select({ userId: users.id, email: users.email, name: users.name, role: memberships.role, lastLoginAt: users.lastLoginAt, isActive: users.isActive })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.orgId, orgId))
    .orderBy(users.name);
}
