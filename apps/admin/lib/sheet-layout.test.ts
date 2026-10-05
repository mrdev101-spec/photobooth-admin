import { describe, expect, it } from 'vitest';
import { SheetLayoutSchema } from '@photobooth/contracts';
import { SHEET_PRESETS, kioskDefaultLayout, layoutPreset, layoutProblems, maxPhotoScale, photoRect, SHEET_SIZES, zoneSpots } from './sheet-layout';

describe('sheet layout (port of the kiosk a4Sheet.js)', () => {
  it('every preset is a valid settings value with nothing off the printable area', () => {
    for (const sheet of ['a4', 'a5'] as const) {
      for (const p of SHEET_PRESETS[sheet]) {
        const layout = layoutPreset(p.id, sheet);
        expect(SheetLayoutSchema.safeParse(layout).success, `${sheet}/${p.id}`).toBe(true);
        // (The kiosk's A4 presets let the badge area run under the queue number box, as it prints them)
        expect(layoutProblems(layout, sheet).filter((x) => x.kind === 'edge'), `${sheet}/${p.id}`).toEqual([]);
      }
    }
  });

  it('A4 default: two real-size 4x6 photos side by side, badges below', () => {
    const l = kioskDefaultLayout('a4');
    expect(l.photos).toHaveLength(2);
    expect(photoRect(l.photos[0]!)).toMatchObject({ w: 101.6, h: 152.4 });
    expect(l.zones).toHaveLength(1);
    // 58 mm badges (70 mm cut): one row of 2 under the photos; 44 mm (54 mm cut): 2 rows of 3
    expect(zoneSpots(l.zones[0]!, 70)).toHaveLength(2);
    expect(zoneSpots(l.zones[0]!, 54)).toHaveLength(6);
  });

  it('largest photo scale stays inside the margins', () => {
    const k = maxPhotoScale(SHEET_SIZES.a5, 3.4);
    expect(PHOTO_W(k)).toBeLessThanOrEqual(148 - 6.8);
  });
});

const PHOTO_W = (k: number) => 101.6 * k;
