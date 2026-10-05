import { describe, expect, it } from 'vitest';
import { aiUsageLevel, currentMonth } from './ai-quota';

describe('AI quota', () => {
  it('warns from 80 % and closes at the quota', () => {
    expect(aiUsageLevel(79, 100)).toBe('ok');
    expect(aiUsageLevel(80, 100)).toBe('warn');
    expect(aiUsageLevel(100, 100)).toBe('full');
    expect(aiUsageLevel(5, 0)).toBe('full');
    expect(aiUsageLevel(10_000, null)).toBe('ok');
  });

  it('counts by the Thai calendar month', () => {
    // 31 Oct 17:30 UTC = 1 Nov 00:30 in Bangkok
    expect(currentMonth(new Date('2026-10-31T17:30:00Z'))).toBe('2026-11');
    expect(currentMonth(new Date('2026-10-31T16:59:00Z'))).toBe('2026-10');
  });
});
