import { describe, expect, it } from 'vitest';
import { periodFromParams } from './period';

describe('report period', () => {
  it('defaults to this Thai month up to today (inclusive)', () => {
    const p = periodFromParams(new URLSearchParams(), new Date('2026-10-31T18:00:00Z')); // 1 Nov 01:00 in Bangkok
    expect(p.fromDay).toBe('2026-11-01');
    expect(p.from.toISOString()).toBe('2026-10-31T17:00:00.000Z');
    expect(p.to.toISOString()).toBe('2026-11-01T17:00:00.000Z');
  });
  it('ignores malformed dates', () => {
    const p = periodFromParams({ from: '2026-10-05', to: 'x' }, new Date('2026-10-10T05:00:00Z'));
    expect(p.fromDay).toBe('2026-10-05');
    expect(p.toDay).toBe('2026-10-10');
  });
});
