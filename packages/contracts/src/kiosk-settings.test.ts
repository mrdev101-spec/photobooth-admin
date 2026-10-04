import { describe, expect, it } from 'vitest';
import { KioskSettingsSchema, defaultKioskSettings } from './kiosk-settings';

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
});
