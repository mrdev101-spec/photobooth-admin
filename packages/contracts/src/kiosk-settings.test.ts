import { describe, expect, it } from 'vitest';
import { KioskSettingsSchema, defaultKioskSettings, withSettingsDefaults } from './kiosk-settings';

describe('KioskSettingsSchema', () => {
  it('accepts the default settings', () => {
    expect(KioskSettingsSchema.safeParse(defaultKioskSettings()).success).toBe(true);
  });

  it('rejects negative and fractional prices', () => {
    const s = defaultKioskSettings();
    s.products.photo.price = -1;
    expect(KioskSettingsSchema.safeParse(s).success).toBe(false);
    s.products.photo.price = 9.5;
    expect(KioskSettingsSchema.safeParse(s).success).toBe(false);
  });

  it('rejects an unknown mode', () => {
    const s = { ...defaultKioskSettings(), appMode: 'video' };
    expect(KioskSettingsSchema.safeParse(s).success).toBe(false);
  });

  it('requires the default layout to be one of the enabled layouts', () => {
    const s = defaultKioskSettings();
    s.templates.photoLayouts = ['pastel', 'neon'];
    s.templates.photoDefaultLayout = 'classic';
    const r = KioskSettingsSchema.safeParse(s);
    expect(r.success).toBe(false);
    s.templates.photoDefaultLayout = 'neon';
    expect(KioskSettingsSchema.safeParse(s).success).toBe(true);
  });

  it('rejects an unknown AI scene', () => {
    const s = defaultKioskSettings();
    s.templates.aiScenes = ['moon-base'];
    expect(KioskSettingsSchema.safeParse(s).success).toBe(false);
  });

  it('fills settings added after a revision was saved, keeping stored values', () => {
    const { print, attract, sound, paper, ...old } = defaultKioskSettings();
    const stored = JSON.parse(JSON.stringify({ ...old, brand: { brandName: 'Shop', photoTitle: 'T', photoTagline: '' }, payment: { enabled: true, mode: 'test', email: '', qrTimeoutSec: 200 } }));
    const s = withSettingsDefaults(stored);
    expect(KioskSettingsSchema.safeParse(s).success).toBe(true);
    expect(s.brand).toEqual({ brandName: 'Shop', photoTitle: 'T', photoTagline: '', printBranding: 'brand' });
    expect(s.payment).toMatchObject({ enabled: true, bypass: false, qrTimeoutSec: 200 });
    expect(s.print.queueSlip).toBe(true);
    expect(s.sound.musicTrack).toBe('kawaii');
    expect(s.adminPin).toBeNull();
    expect(s.templates.photoLayouts).toEqual([]);
  });

  it('accepts the 38 mm badge and checks the new ranges', () => {
    const s = defaultKioskSettings();
    s.badge.size = '38';
    expect(KioskSettingsSchema.safeParse(s).success).toBe(true);
    s.sound.musicVolume = 250;
    expect(KioskSettingsSchema.safeParse(s).success).toBe(false);
    s.sound.musicVolume = 200;
    s.print.queuePrefix = 'ab';
    expect(KioskSettingsSchema.safeParse(s).success).toBe(false);
  });
});
