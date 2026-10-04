import { describe, expect, it } from 'vitest';
import { defaultKioskSettings, KioskSettingsSchema } from './kiosk-settings';
import { FrameSpecSchema, TextSlotSchema, frameIssues, isUploadedTemplateId, overlaySizeIssue } from './templates';

const text = { field: 'event.title', x: 600, y: 1600, maxWidth: 900, font: 'Fredoka', size: 72, color: '#FFFFFF' } as const;

describe('uploaded template ids', () => {
  it('only accepts tpl_ ids', () => {
    expect(isUploadedTemplateId('tpl_summerfest')).toBe(true);
    expect(isUploadedTemplateId('classic')).toBe(false);
    expect(isUploadedTemplateId('tpl_')).toBe(false);
    expect(isUploadedTemplateId('tpl_Bad Name')).toBe(false);
  });

  it('kiosk settings accept uploaded ids in every list and as defaults', () => {
    const s = defaultKioskSettings();
    const r = KioskSettingsSchema.safeParse({
      ...s,
      templates: { ...s.templates, photoLayouts: [], photoDefaultLayout: 'tpl_summer', aiScenes: ['tpl_tokyo', 'neon-city'], classic: ['tpl_receipt2'] }
    });
    expect(r.success).toBe(true);
    const bad = KioskSettingsSchema.safeParse({ ...s, templates: { ...s.templates, aiScenes: ['not-a-scene'] } });
    expect(bad.success).toBe(false);
  });
});

describe('frame spec', () => {
  it('text slot needs a field or a fixed text, not both', () => {
    expect(TextSlotSchema.safeParse(text).success).toBe(true);
    expect(TextSlotSchema.safeParse({ ...text, field: undefined, text: 'HELLO' }).success).toBe(true);
    expect(TextSlotSchema.safeParse({ ...text, text: 'HELLO' }).success).toBe(false);
    expect(TextSlotSchema.safeParse({ ...text, field: undefined }).success).toBe(false);
  });

  it('checks overlay pixel sizes per kind', () => {
    expect(overlaySizeIssue('photo-4x6', 1200, 1800)).toBeNull();
    expect(overlaySizeIssue('photo-4x6', 1000, 1500)).toMatch('1200');
    expect(overlaySizeIssue('badge', 1000, 1000)).toBeNull();
    expect(overlaySizeIssue('classic', 384, 1200)).toBeNull();
    expect(overlaySizeIssue('classic', 576, 100)).toMatch('ความสูง');
  });

  it('finds slots outside the canvas, wrong shapes and text outside the safe area', () => {
    const ok = FrameSpecSchema.parse({ photoSlots: [{ x: 90, y: 90, w: 1020, h: 1300 }], textSlots: [text] });
    expect(frameIssues('photo-4x6', ok, { width: 1200, height: 1800 })).toEqual([]);
    expect(frameIssues('photo-4x6', ok, undefined)).toEqual(['ยังไม่ได้อัปโหลดภาพกรอบ (PNG)']);

    const off = FrameSpecSchema.parse({ photoSlots: [{ x: 90, y: 900, w: 1020, h: 1300 }], textSlots: [{ ...text, y: 1790 }] });
    const issues = frameIssues('photo-4x6', off, { width: 1200, height: 1800 });
    expect(issues.some((i) => i.includes('ล้นขอบ'))).toBe(true);
    expect(issues.some((i) => i.includes('พื้นที่ปลอดภัย'))).toBe(true);

    const badgeRect = FrameSpecSchema.parse({ photoSlots: [{ x: 100, y: 100, w: 800, h: 800 }] });
    expect(frameIssues('badge', badgeRect, { width: 1000, height: 1000 })[0]).toMatch('วงกลม');
    const circle = FrameSpecSchema.parse({ photoSlots: [{ shape: 'circle', cx: 500, cy: 500, r: 330 }] });
    expect(frameIssues('badge', circle, { width: 1000, height: 1000 })).toEqual([]);
    expect(frameIssues('photo-4x6', circle, { width: 1200, height: 1800 })[0]).toMatch('เฉพาะเข็มกลัด');
  });
});
