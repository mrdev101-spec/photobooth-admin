import { describe, expect, it } from 'vitest';
import { connectionOf, kioskIssues, type KioskIssueInput } from './kiosk-status';

const NOW = Date.parse('2026-10-01T10:00:00Z');
const ago = (ms: number) => new Date(NOW - ms);

const base: KioskIssueInput = {
  status: 'active',
  lastSeenAt: ago(30_000),
  fingerprintMismatch: false,
  maintenance: false,
  queueDepth: 0,
  currentRevision: 3,
  appliedRevision: 3,
  printerState: [{ role: 'main', name: 'POS-80C', ok: true }],
  cameraState: { ok: true }
};

describe('connectionOf', () => {
  it('follows the heartbeat age', () => {
    expect(connectionOf({ status: 'active', lastSeenAt: ago(60_000) }, NOW)).toBe('online');
    expect(connectionOf({ status: 'active', lastSeenAt: ago(150_001) }, NOW)).toBe('stale');
    expect(connectionOf({ status: 'active', lastSeenAt: ago(10 * 60_000 + 1) }, NOW)).toBe('offline');
    expect(connectionOf({ status: 'active', lastSeenAt: null }, NOW)).toBe('never');
  });

  it('reports pending and revoked kiosks as such, whatever the last heartbeat', () => {
    expect(connectionOf({ status: 'pending', lastSeenAt: ago(1000) }, NOW)).toBe('pending');
    expect(connectionOf({ status: 'revoked', lastSeenAt: ago(1000) }, NOW)).toBe('revoked');
  });
});

describe('kioskIssues', () => {
  it('is empty for a healthy kiosk', () => {
    expect(kioskIssues(base, NOW)).toEqual([]);
  });

  it('flags offline, fingerprint, printer and camera problems', () => {
    const issues = kioskIssues(
      {
        ...base,
        lastSeenAt: ago(60 * 60_000),
        fingerprintMismatch: true,
        printerState: [{ role: 'photo', name: 'DNP', ok: false, error: 'paper out' }],
        cameraState: { ok: false }
      },
      NOW
    );
    expect(issues.map((i) => i.level)).toEqual(['danger', 'danger', 'danger', 'danger']);
    expect(issues[2]!.text).toContain('paper out');
  });

  it('notes a pending config and a backlog', () => {
    const issues = kioskIssues({ ...base, appliedRevision: 2, queueDepth: 80 }, NOW);
    expect(issues.map((i) => i.level)).toEqual(['warn', 'info']);
  });

  it('ignores kiosks that are not paired', () => {
    expect(kioskIssues({ ...base, status: 'pending', lastSeenAt: null }, NOW)).toEqual([]);
  });
});

describe('config rejection', () => {
  it('shows the rejection instead of "waiting" for the same revision', () => {
    const issues = kioskIssues({ ...base, currentRevision: 4, appliedRevision: 3, configError: { revision: 4, message: 'bad frame' } }, NOW);
    expect(issues.map((i) => i.text)).toEqual(['ตู้ไม่รับการตั้งค่า revision 4: bad frame']);
  });
});

describe('disabled kiosks', () => {
  it('shows as disabled whatever the heartbeat, with no attention items', () => {
    const k = { ...base, status: 'disabled' as const, lastSeenAt: ago(5_000) };
    expect(connectionOf(k, NOW)).toBe('disabled');
    expect(kioskIssues(k, NOW)).toEqual([]);
  });
});
