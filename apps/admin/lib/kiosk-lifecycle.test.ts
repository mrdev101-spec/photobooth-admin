import { describe, expect, it } from 'vitest';
import { inTab, journeyStep, kioskStage } from './kiosk-lifecycle';

const k = (status: 'pending' | 'active' | 'disabled' | 'revoked', extra: { pairedAt?: Date | null; archivedAt?: Date | null } = {}) => ({ status, pairedAt: extra.pairedAt ?? null, archivedAt: extra.archivedAt ?? null });

describe('kioskStage', () => {
  it('follows a kiosk through the stock', () => {
    expect(kioskStage(k('pending'), true)).toBe('stock_new');
    expect(kioskStage(k('active', { pairedAt: new Date() }), true)).toBe('stock_testing');
    expect(kioskStage(k('revoked', { pairedAt: new Date() }), true)).toBe('stock_ready');
  });
  it('follows a kiosk at a shop', () => {
    expect(kioskStage(k('pending'), false)).toBe('shop_waiting');
    expect(kioskStage(k('active'), false)).toBe('shop_active');
    expect(kioskStage(k('disabled'), false)).toBe('shop_disabled');
    expect(kioskStage(k('revoked'), false)).toBe('shop_locked');
  });
  it('a retired kiosk is archived wherever it is', () => {
    expect(kioskStage(k('revoked', { archivedAt: new Date() }), false)).toBe('archived');
    expect(kioskStage(k('revoked', { archivedAt: new Date() }), true)).toBe('archived');
  });
  it('journey steps and tabs', () => {
    expect(journeyStep('stock_ready')).toBe(2);
    expect(journeyStep('shop_waiting')).toBe(4);
    expect(journeyStep('shop_active')).toBe(5);
    expect(inTab('stock', 'stock_new', false)).toBe(true);
    expect(inTab('shops', 'stock_new', false)).toBe(false);
    expect(inTab('all', 'archived', false)).toBe(false);
    expect(inTab('archived', 'archived', false)).toBe(true);
    expect(inTab('attention', 'shop_active', true)).toBe(true);
    expect(inTab('attention', 'shop_locked', false)).toBe(true);
  });
});
