import { describe, expect, it } from 'vitest';
import { resolveRange, thaiDayStart, thaiYmd } from './date-range';

describe('Thai-time report ranges', () => {
  const now = new Date('2026-10-01T18:30:00Z'); // 01:30 on 2 Oct in Thailand

  it('uses the Thai calendar day', () => {
    expect(thaiYmd(now)).toBe('2026-10-02');
    expect(thaiDayStart('2026-10-02')!.toISOString()).toBe('2026-10-01T17:00:00.000Z');
  });

  it('resolves presets to [from, to)', () => {
    const t = resolveRange('today', undefined, undefined, now);
    expect([t.from.toISOString(), t.to.toISOString()]).toEqual(['2026-10-01T17:00:00.000Z', '2026-10-02T17:00:00.000Z']);
    expect(resolveRange('7d', undefined, undefined, now).from.toISOString()).toBe('2026-09-25T17:00:00.000Z');
    expect(resolveRange('month', undefined, undefined, now).from.toISOString()).toBe('2026-09-30T17:00:00.000Z');
  });

  it('accepts a custom range and falls back on bad input', () => {
    const c = resolveRange('custom', '2026-09-01', '2026-09-30', now);
    expect(c.preset).toBe('custom');
    expect(c.to.toISOString()).toBe('2026-09-30T17:00:00.000Z');
    expect(resolveRange('custom', '2026-09-30', '2026-09-01', now).preset).toBe('today');
  });
});
