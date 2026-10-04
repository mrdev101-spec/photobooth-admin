import { describe, expect, it } from 'vitest';
import { defaultKioskSettings } from '@photobooth/contracts';
import { DEFAULT_CONFIG_PERMISSIONS, levelOf, lockedChanges, resolvePermissions, sectionOf } from './config-permissions';

describe('config permissions', () => {
  it('maps settings paths to sections', () => {
    expect(sectionOf('products.photo.price')).toBe('products');
    expect(sectionOf('photoFulfillment')).toBe('products');
    expect(sectionOf('event.accent')).toBe('brand');
    expect(sectionOf('adminPin')).toBe('behavior');
    expect(sectionOf('appMode')).toBe('mode');
    expect(sectionOf('templates.aiScenes')).toBe('templates');
  });

  it('merges stored values over the defaults and ignores junk', () => {
    const p = resolvePermissions({ mode: 'edit', payment: 'nope', unknown: 'edit' });
    expect(p.mode).toBe('edit');
    expect(p.payment).toBe(DEFAULT_CONFIG_PERMISSIONS.payment);
    expect(resolvePermissions(null)).toEqual(DEFAULT_CONFIG_PERMISSIONS);
  });

  it('allows changes to editable sections only', () => {
    const before = defaultKioskSettings();
    const after = defaultKioskSettings();
    after.products.photo.price = 150;
    after.brand.brandName = 'Party';
    expect(lockedChanges(DEFAULT_CONFIG_PERMISSIONS, before, after)).toEqual([]);

    after.appMode = 'photo';
    after.payment.enabled = true;
    expect(lockedChanges(DEFAULT_CONFIG_PERMISSIONS, before, after)).toEqual(['mode', 'payment']);
    expect(levelOf(DEFAULT_CONFIG_PERMISSIONS, 'payment.mode')).toBe('view');
  });

  it('treats a PIN change as a behavior change', () => {
    const perms = { ...DEFAULT_CONFIG_PERMISSIONS, behavior: 'view' as const };
    const before = defaultKioskSettings();
    const after = { ...defaultKioskSettings(), adminPin: { algo: 'pbkdf2-sha256' as const, iterations: 1, salt: 'x', hash: 'y' } };
    expect(lockedChanges(perms, before, after)).toEqual(['behavior']);
  });
});
