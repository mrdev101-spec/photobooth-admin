import { describe, expect, it } from 'vitest';
import { defaultKioskSettings } from '@photobooth/contracts';
import { forKiosk, publishedIds, visibleIds, withVisible, type CatalogState } from './template-visibility';

const uploaded: CatalogState = {
  retired: {},
  uploaded: [{ kind: 'photo-4x6', id: 'tpl_summer', name: 'Summer', desc: '' }]
};

describe('template visibility', () => {
  const t = defaultKioskSettings().templates;

  it('resolves "all" to every published template', () => {
    expect(visibleIds(t, 'photo-4x6')).toEqual(publishedIds('photo-4x6'));
    expect(visibleIds(t, 'ai-scene')).toHaveLength(10);
  });

  it('stores an explicit list when some are hidden, and [] when all are shown again', () => {
    const some = withVisible(t, 'photo-4x6', ['pastel', 'neon']);
    expect(some.photoLayouts).toEqual(['neon', 'pastel'].sort((a, b) => publishedIds('photo-4x6').indexOf(a) - publishedIds('photo-4x6').indexOf(b)));
    expect(some.photoDefaultLayout).toBe(some.photoLayouts[0]); // 'classic' was hidden, so the default moved
    expect(withVisible(some, 'photo-4x6', publishedIds('photo-4x6')).photoLayouts).toEqual([]);
  });

  it('refuses to hide everything', () => {
    expect(() => withVisible(t, 'badge', [])).toThrow();
  });

  it('removes retired templates for the kiosk, even from "all"', () => {
    const s = defaultKioskSettings();
    const out = forKiosk(s, { retired: { 'photo-4x6': new Set(['classic']) }, uploaded: [] }, { supportsUploaded: true });
    expect(out.templates.photoLayouts).not.toContain('classic');
    expect(out.templates.photoLayouts.length).toBe(publishedIds('photo-4x6').length - 1);
    expect(out.templates.photoDefaultLayout).not.toBe('classic');
    expect(forKiosk(s, { retired: {}, uploaded: [] }, { supportsUploaded: true })).toBe(s);
  });

  it('includes published uploaded templates in "all" and in explicit lists', () => {
    expect(publishedIds('photo-4x6', uploaded)).toContain('tpl_summer');
    expect(visibleIds(t, 'photo-4x6', uploaded)).toContain('tpl_summer');
    const only = withVisible(t, 'photo-4x6', ['tpl_summer', 'neon'], uploaded);
    expect(only.photoLayouts).toEqual(['neon', 'tpl_summer']);
  });

  it('keeps uploaded ids away from kiosks that cannot draw them', () => {
    const s = defaultKioskSettings();
    const only = { ...s, templates: { ...withVisible(s.templates, 'photo-4x6', ['tpl_summer', 'neon'], uploaded), photoDefaultLayout: 'tpl_summer' } };
    const old = forKiosk(only, uploaded, { supportsUploaded: false });
    expect(old.templates.photoLayouts).toEqual(['neon']);
    expect(old.templates.photoDefaultLayout).toBe('neon');
    // "all" stays "all" for an old kiosk: it only knows built-ins anyway
    expect(forKiosk(s, uploaded, { supportsUploaded: false })).toBe(s);
    // A kiosk that reads the manifest gets them as saved
    expect(forKiosk(only, uploaded, { supportsUploaded: true }).templates.photoLayouts).toEqual(['neon', 'tpl_summer']);
  });

  it('falls back to a built-in when an old kiosk would be left with nothing', () => {
    const s = defaultKioskSettings();
    const onlyUploaded = { ...s, templates: { ...withVisible(s.templates, 'photo-4x6', ['tpl_summer'], uploaded) } };
    const old = forKiosk(onlyUploaded, uploaded, { supportsUploaded: false });
    expect(old.templates.photoLayouts).toHaveLength(1);
    expect(publishedIds('photo-4x6')).toContain(old.templates.photoLayouts[0]);
  });
});
