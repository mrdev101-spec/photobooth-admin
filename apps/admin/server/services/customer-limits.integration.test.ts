/**
 * Integration test against a real MariaDB (apps/admin/.env.local → DATABASE_URL); skipped when
 * no database is configured. Creates its own customer, user and kiosk and deletes them after.
 *
 * Covers the rules a customer could try to bypass with a crafted request (docs §17):
 * locked kiosk-settings sections, the user quota, and the platform-only fleet actions.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  redirect: () => {
    throw new Error('NEXT_REDIRECT');
  }
}));
vi.mock('@/server/audit', () => ({ audit: async () => {} }));
vi.mock('@/server/auth/session', () => ({ destroyAllSessions: async () => {}, requestMeta: async () => ({ ip: null, userAgent: null }) }));

try {
  process.loadEnvFile('.env.local');
} catch {
  // no local env: the suite is skipped below
}

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)('customer limits (integration, local DB)', async () => {
  const { eq } = await import('drizzle-orm');
  const { db } = await import('@/server/db/client');
  const { branches, kioskConfigRevisions, kiosks, memberships, organizations, users } = await import('@/server/db/schema');
  const { defaultKioskSettings } = await import('@photobooth/contracts');
  const { newId } = await import('@/server/lib/ids');
  const { saveKioskConfig } = await import('./kiosk-config');
  const { addMember } = await import('./members');
  const { createKiosk, setKioskEnabled, unpairKiosk } = await import('./kiosks');
  type OrgContext = import('@/server/auth/context').OrgContext;

  const orgId = newId('org');
  const userId = newId('usr');
  const branchId = newId('brn');
  const kioskId = newId('ksk');
  const settings = defaultKioskSettings();
  let customer: OrgContext;
  let platform: OrgContext;

  beforeAll(async () => {
    await db().insert(organizations).values({ id: orgId, slug: `it-${orgId.slice(-10).toLowerCase()}`, name: 'Integration Test Co', userQuota: 1, kioskQuota: 5 });
    await db().insert(users).values({ id: userId, email: `${userId.toLowerCase()}@it.test`, name: 'IT Owner', passwordHash: 'x', mustChangePassword: false });
    await db().insert(memberships).values({ orgId, userId, role: 'owner' });
    await db().insert(branches).values({ id: branchId, orgId, name: 'IT Branch' });
    await db().insert(kiosks).values({ id: kioskId, orgId, branchId, name: 'IT Booth', status: 'active', kioskId: `KS-${kioskId.slice(-8).toUpperCase().replace(/[^0-9A-F]/g, 'A')}`, currentRevision: 1 });
    await db().insert(kioskConfigRevisions).values({ kioskRowId: kioskId, revision: 1, orgId, settings });
    const org = (await db().select().from(organizations).where(eq(organizations.id, orgId)))[0]!;
    const user = { id: userId, email: 'owner@it.test', name: 'IT Owner', platformRole: null, mustChangePassword: false };
    customer = { user, org, principal: { platformRole: null, orgRole: 'owner', branches: 'all' }, actingAsPlatform: false };
    platform = { user: { ...user, platformRole: 'platform_admin' }, org, principal: { platformRole: 'platform_admin', orgRole: null, branches: 'all' }, actingAsPlatform: true };
  });

  afterAll(async () => {
    await db().delete(kioskConfigRevisions).where(eq(kioskConfigRevisions.orgId, orgId));
    await db().delete(kiosks).where(eq(kiosks.orgId, orgId));
    await db().delete(branches).where(eq(branches.orgId, orgId));
    await db().delete(memberships).where(eq(memberships.orgId, orgId));
    await db().delete(users).where(eq(users.id, userId));
    await db().delete(organizations).where(eq(organizations.id, orgId));
  });

  const { adminPin: _pin, ...editable } = settings;
  const save = (ctx: OrgContext, base: number, patch: Partial<typeof editable>) =>
    saveKioskConfig(ctx, kioskId, { baseRevision: base, settings: { ...editable, ...patch }, pin: { action: 'keep' }, note: 'it' });

  it('rejects a customer changing a locked section (mode, payment)', async () => {
    await expect(save(customer, 1, { appMode: 'ai' })).rejects.toThrow(/จัดการโดยผู้ให้บริการ/);
    await expect(save(customer, 1, { payment: { ...editable.payment, enabled: true } })).rejects.toThrow(/การรับเงิน/);
  });

  it('accepts a customer changing an editable section', async () => {
    const r = await save(customer, 1, { products: { ...editable.products, photo: { sell: true, price: 129 } } });
    expect(r).toEqual({ revision: 2, changed: true });
  });

  it('lets the platform team change locked sections', async () => {
    const r = await save(platform, 2, { products: { ...editable.products, photo: { sell: true, price: 129 } }, appMode: 'photo' });
    expect(r.revision).toBe(3);
  });

  it('enforces the user quota for customers only', async () => {
    const input = { email: `extra-${userId.toLowerCase()}@it.test`, name: 'Extra', role: 'viewer' as const, allBranches: true, branchIds: [] };
    await expect(addMember(customer, input)).rejects.toThrow(/ครบ 1 คน/);
    const added = await addMember(platform, input); // the platform may go over its own limit
    await db().delete(memberships).where(eq(memberships.userId, added.userId));
    await db().delete(users).where(eq(users.id, added.userId));
  });

  it('keeps fleet actions (add / unpair / disable) with the platform', async () => {
    await expect(createKiosk(customer, { name: 'Nope', branchId })).rejects.toThrow(/ผู้ให้บริการ/);
    await expect(unpairKiosk(customer, kioskId)).rejects.toThrow(/ผู้ให้บริการ/);
    await expect(setKioskEnabled(customer, kioskId, false, 'x')).rejects.toThrow();
    await setKioskEnabled(platform, kioskId, false, 'ค้างชำระ');
    const k = (await db().select().from(kiosks).where(eq(kiosks.id, kioskId)))[0]!;
    expect(k.status).toBe('disabled');
    expect(k.disabledReason).toBe('ค้างชำระ');
    await setKioskEnabled(platform, kioskId, true);
  });
});
