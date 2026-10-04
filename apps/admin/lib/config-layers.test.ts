import { describe, expect, it } from 'vitest';
import { defaultKioskSettings } from '@photobooth/contracts';
import { composeSettings, normalizeOwnSections } from './config-layers';

const kiosk = () => {
  const s = defaultKioskSettings();
  s.identity.name = 'Booth A';
  s.products.photo.price = 99;
  s.sound.musicVolume = 150;
  s.appMode = 'photo';
  return s;
};
const event = () => {
  const s = defaultKioskSettings();
  s.identity.name = 'ไม่ควรถูกใช้';
  s.products.photo.price = 149;
  s.photoFulfillment = 'pickup';
  s.event.title = 'งานแต่ง A & B';
  s.sound.musicVolume = 30;
  s.appMode = 'classic';
  return s;
};

describe('config layers', () => {
  it('treats legacy kiosks (null) as owning every section', () => {
    const r = composeSettings(kiosk(), event(), null);
    expect(r).toEqual(kiosk());
  });

  it('always keeps identity, takes inherited sections whole from the source', () => {
    const r = composeSettings(kiosk(), event(), []);
    expect(r.identity.name).toBe('Booth A');
    expect(r.products.photo.price).toBe(149);
    expect(r.photoFulfillment).toBe('pickup'); // same section as products
    expect(r.event.title).toBe('งานแต่ง A & B');
    expect(r.appMode).toBe('classic');
  });

  it('keeps the sections the kiosk sets itself', () => {
    const r = composeSettings(kiosk(), event(), ['sound', 'mode']);
    expect(r.sound.musicVolume).toBe(150);
    expect(r.appMode).toBe('photo');
    expect(r.products.photo.price).toBe(149);
  });

  it('does not share objects with the source', () => {
    const src = event();
    const r = composeSettings(kiosk(), src, []);
    r.products.photo.price = 1;
    expect(src.products.photo.price).toBe(149);
  });

  it('cleans unknown section ids and adds identity', () => {
    expect(normalizeOwnSections(['sound', 'nope'])).toEqual(['identity', 'sound']);
  });
});
