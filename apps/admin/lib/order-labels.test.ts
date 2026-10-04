import { describe, expect, it } from 'vitest';
import { productLabel, statusLabel } from './order-labels';

describe('productLabel', () => {
  it('names known products', () => {
    expect(productLabel('bundle')).toBe('ภาพ + เข็มกลัด');
    expect(productLabel('neon-city', 'ai')).toBe('AI: Neon Dreams');
  });

  it('falls back by mode for ids from a newer kiosk', () => {
    expect(productLabel('new-scene', 'ai')).toBe('AI: new-scene');
    expect(productLabel('new-receipt', 'classic')).toBe('Classic: new-receipt');
    expect(productLabel('mystery')).toBe('mystery');
  });
});

describe('statusLabel', () => {
  it('shows kiosk orders that have not reported the print as printing', () => {
    expect(statusLabel('uploaded', 'kiosk').label).toBe('กำลังพิมพ์ที่ตู้');
    expect(statusLabel('uploaded', 'pickup').label).toBe('รอรับ');
  });
});
