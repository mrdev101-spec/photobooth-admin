import { describe, expect, it } from 'vitest';
import { ORG_ACTIONS, can, canPlatform, type Principal } from './rbac';

const member = (orgRole: Principal['orgRole'], branches: Principal['branches'] = 'all'): Principal => ({ platformRole: null, orgRole, branches });

describe('can (org roles)', () => {
  it('gives owners every org action', () => {
    for (const action of ORG_ACTIONS) expect(can(member('owner'), action)).toBe(true);
  });

  it('keeps managers out of member management and org settings', () => {
    expect(can(member('manager'), 'member.manage')).toBe(false);
    expect(can(member('manager'), 'org.settings')).toBe(false);
    expect(can(member('manager'), 'config.edit')).toBe(true);
  });

  it('limits pickup staff to the pickup page and order lookup', () => {
    const p = member('pickup_staff');
    expect(can(p, 'pickup.use')).toBe(true);
    expect(can(p, 'order.view')).toBe(true);
    expect(can(p, 'config.edit')).toBe(false);
    expect(can(p, 'payment.view')).toBe(false);
  });

  it('never lets designers see money', () => {
    expect(can(member('designer'), 'payment.view')).toBe(false);
    expect(can(member('designer'), 'report.view')).toBe(false);
  });

  it('applies branch limits to branch-scoped actions only', () => {
    const p = member('manager', ['brn_a']);
    expect(can(p, 'kiosk.manage', { branchId: 'brn_a' })).toBe(true);
    expect(can(p, 'kiosk.manage', { branchId: 'brn_b' })).toBe(false);
    expect(can(p, 'report.view', { branchId: 'brn_b' })).toBe(true);
  });

  it('denies everything to a principal with no role', () => {
    for (const action of ORG_ACTIONS) expect(can(member(null), action)).toBe(false);
  });
});

describe('platform roles inside a customer', () => {
  it('lets platform admins do everything, regardless of branches', () => {
    const p: Principal = { platformRole: 'platform_admin', orgRole: null, branches: [] };
    for (const action of ORG_ACTIONS) expect(can(p, action, { branchId: 'brn_x' })).toBe(true);
  });

  it('keeps platform support read-only', () => {
    const p: Principal = { platformRole: 'platform_support', orgRole: null, branches: 'all' };
    expect(can(p, 'kiosk.view')).toBe(true);
    expect(can(p, 'member.manage')).toBe(false);
    expect(can(p, 'config.edit')).toBe(false);
  });
});

describe('canPlatform', () => {
  it('separates platform admin and support', () => {
    expect(canPlatform('platform_admin', 'platform.org.manage')).toBe(true);
    expect(canPlatform('platform_support', 'platform.org.manage')).toBe(false);
    expect(canPlatform('platform_support', 'platform.view')).toBe(true);
    expect(canPlatform(null, 'platform.view')).toBe(false);
  });
});
