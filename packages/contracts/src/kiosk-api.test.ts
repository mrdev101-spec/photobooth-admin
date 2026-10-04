import { describe, expect, it } from 'vitest';
import { HeartbeatRequestSchema, PairRequestSchema, normalizePairCode } from './kiosk-api';

describe('pairing request', () => {
  it('accepts the kiosk identity format and normalises the code', () => {
    const r = PairRequestSchema.parse({ pairCode: 'abcd-2345', kioskId: 'KS-357C1501', fingerprint: '0123456789ABCDEF' });
    expect(r.pairCode).toBe('ABCD2345');
    expect(r.hostname).toBe('');
  });

  it('rejects malformed Kiosk IDs and fingerprints', () => {
    expect(PairRequestSchema.safeParse({ pairCode: 'X', kioskId: 'KS-12', fingerprint: '0123456789ABCDEF' }).success).toBe(false);
    expect(PairRequestSchema.safeParse({ pairCode: 'X', kioskId: 'KS-357C1501', fingerprint: 'nothex' }).success).toBe(false);
  });

  it('strips spaces and dashes from typed codes', () => {
    expect(normalizePairCode(' ab cd-23 45 ')).toBe('ABCD2345');
  });
});

describe('heartbeat request', () => {
  it('fills defaults for a minimal heartbeat', () => {
    const r = HeartbeatRequestSchema.parse({ mode: 'photo' });
    expect(r).toMatchObject({ mode: 'photo', revision: 0, queueDepth: 0, printers: [] });
  });

  it('rejects unknown modes and printer roles', () => {
    expect(HeartbeatRequestSchema.safeParse({ mode: 'video' }).success).toBe(false);
    expect(HeartbeatRequestSchema.safeParse({ mode: 'photo', printers: [{ role: 'label', name: 'x', ok: true }] }).success).toBe(false);
  });
});
