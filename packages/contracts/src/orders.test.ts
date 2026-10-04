import { describe, expect, it } from 'vitest';
import { OrderInputSchema, formatPickupCode, parsePickupInput } from './orders';

describe('parsePickupInput', () => {
  it('reads typed codes in any form', () => {
    expect(parsePickupInput('zhk-6q6')).toEqual({ code: 'ZHK6Q6', kioskId: null });
    expect(parsePickupInput(' ZHK 6Q6 ')).toEqual({ code: 'ZHK6Q6', kioskId: null });
  });

  it('reads the slip QR (download URL) with the kiosk folder', () => {
    const url = 'https://img.example.com/view-ab12.html#p/KS-357C1501/o/ZHK6Q6/9f2c-photo.jpg';
    expect(parsePickupInput(url)).toEqual({ code: 'ZHK6Q6', kioskId: 'KS-357C1501' });
  });

  it('rejects look-alike characters and wrong lengths', () => {
    expect(parsePickupInput('ZHK6Q0')).toBeNull(); // 0 is not in the alphabet
    expect(parsePickupInput('ZHK6Q')).toBeNull();
    expect(parsePickupInput('')).toBeNull();
  });

  it('formats codes for people', () => {
    expect(formatPickupCode('ZHK6Q6')).toBe('ZHK-6Q6');
  });
});

describe('OrderInputSchema', () => {
  const base = {
    clientOrderId: 'c-1',
    mode: 'photo',
    product: 'photo',
    items: [{ type: 'photo', qty: 1 }],
    amount: 99,
    payment: { kind: 'live' },
    orderedAt: '2026-10-01T10:00:00.000Z'
  } as const;

  it('accepts a kiosk-printed order without code or files', () => {
    expect(OrderInputSchema.safeParse({ ...base, fulfillment: 'kiosk' }).success).toBe(true);
  });

  it('requires a code and an image for pickup orders', () => {
    const r = OrderInputSchema.safeParse({ ...base, fulfillment: 'pickup' });
    expect(r.success).toBe(false);
    const ok = OrderInputSchema.safeParse({ ...base, fulfillment: 'pickup', code: 'zhk-6q6', files: [{ kind: 'photo', url: 'https://img.example.com/p/KS-1/o/ZHK6Q6/a-photo.jpg' }] });
    expect(ok.success).toBe(true);
    expect(ok.success && ok.data.code).toBe('ZHK6Q6');
    const ai = OrderInputSchema.safeParse({ ...base, fulfillment: 'pickup', code: 'ZHK6Q6', files: [{ kind: 'ai', url: 'https://img.example.com/p/KS-1/o/ZHK6Q6/poster.jpg' }] });
    expect(ai.success).toBe(true);
    const shotsOnly = OrderInputSchema.safeParse({ ...base, fulfillment: 'pickup', code: 'ZHK6Q6', files: [{ kind: 'shot', url: 'https://img.example.com/p/KS-1/o/ZHK6Q6/s1.jpg' }] });
    expect(shotsOnly.success).toBe(false);
  });

  it('rejects non-http file URLs', () => {
    const r = OrderInputSchema.safeParse({ ...base, fulfillment: 'pickup', code: 'ZHK6Q6', files: [{ kind: 'photo', url: 'javascript:alert(1)' }] });
    expect(r.success).toBe(false);
  });
});
