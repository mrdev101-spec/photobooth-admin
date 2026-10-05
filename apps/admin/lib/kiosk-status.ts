import type { Tone } from '@/components/ui';

/**
 * Connection status from the last heartbeat (docs §8.3). The kiosk sends one every 60 s,
 * so 150 s allows one missed beat before a booth is shown as "stale".
 */
export const ONLINE_WITHIN_MS = 150_000;
export const OFFLINE_AFTER_MS = 10 * 60_000;

export type KioskStatus = 'pending' | 'active' | 'disabled' | 'revoked';
export type Connection = 'pending' | 'revoked' | 'disabled' | 'never' | 'online' | 'stale' | 'offline';

export function connectionOf(k: { status: KioskStatus; lastSeenAt: Date | null }, now = Date.now()): Connection {
  if (k.status === 'pending') return 'pending';
  if (k.status === 'disabled') return 'disabled';
  if (k.status === 'revoked') return 'revoked';
  if (!k.lastSeenAt) return 'never';
  const age = now - k.lastSeenAt.getTime();
  if (age <= ONLINE_WITHIN_MS) return 'online';
  if (age <= OFFLINE_AFTER_MS) return 'stale';
  return 'offline';
}

export const CONNECTION_LABEL: Record<Connection, { label: string; tone: Tone }> = {
  online: { label: 'ออนไลน์', tone: 'ok' },
  stale: { label: 'ขาดการติดต่อ', tone: 'warn' },
  offline: { label: 'ออฟไลน์', tone: 'danger' },
  never: { label: 'ยังไม่ส่งสถานะ', tone: 'muted' },
  pending: { label: 'รอลงทะเบียน', tone: 'info' },
  revoked: { label: 'ล็อก (รอ Key)', tone: 'muted' },
  disabled: { label: 'ปิดใช้งานโดยผู้ให้บริการ', tone: 'danger' }
};

export interface KioskIssueInput {
  status: KioskStatus;
  lastSeenAt: Date | null;
  fingerprintMismatch: boolean;
  maintenance: boolean;
  queueDepth: number;
  currentRevision: number;
  appliedRevision: number | null;
  printerState: { role: string; name: string; ok: boolean; error?: string }[] | null;
  cameraState: { ok: boolean; error?: string } | null;
  configError?: { revision: number; message: string } | null;
  emergency?: { since: string; changes: { key: string }[] } | null;
}

export interface KioskIssue {
  level: 'danger' | 'warn' | 'info';
  text: string;
}

const PRINTER_ROLE: Record<string, string> = { main: 'เครื่องพิมพ์หลัก', photo: 'เครื่องพิมพ์ภาพ 4x6', badge: 'เครื่องพิมพ์เข็มกลัด' };

export const QUEUE_BACKLOG = 50;

/** Everything that needs attention on one kiosk, most severe first. */
export function kioskIssues(k: KioskIssueInput, now = Date.now()): KioskIssue[] {
  if (k.status !== 'active') return [];
  const issues: KioskIssue[] = [];
  const conn = connectionOf(k, now);
  if (conn === 'offline') issues.push({ level: 'danger', text: 'ตู้ออฟไลน์' });
  if (conn === 'stale') issues.push({ level: 'warn', text: 'ตู้ขาดการติดต่อ' });
  if (k.fingerprintMismatch) issues.push({ level: 'danger', text: 'เครื่องที่ใช้ Kiosk ID นี้เปลี่ยนไป (fingerprint ไม่ตรง)' });
  for (const p of k.printerState ?? []) {
    if (!p.ok) issues.push({ level: 'danger', text: `${PRINTER_ROLE[p.role] ?? p.role} มีปัญหา${p.error ? `: ${p.error}` : ''}` });
  }
  if (k.cameraState && !k.cameraState.ok) issues.push({ level: 'danger', text: `กล้องมีปัญหา${k.cameraState.error ? `: ${k.cameraState.error}` : ''}` });
  if (k.configError) issues.push({ level: 'danger', text: `ตู้ไม่รับการตั้งค่า revision ${k.configError.revision}${k.configError.message ? `: ${k.configError.message}` : ''}` });
  if (k.emergency) issues.push({ level: 'warn', text: `โหมดฉุกเฉินที่ตู้: แก้ค่าที่ Admin ดูแลไว้ ${k.emergency.changes.length} รายการ` });
  if (k.queueDepth > QUEUE_BACKLOG) issues.push({ level: 'warn', text: `ข้อมูลค้างส่ง ${k.queueDepth} รายการ` });
  const rejectedLatest = !!k.configError && k.configError.revision >= k.currentRevision;
  if (!rejectedLatest && k.appliedRevision != null && k.appliedRevision < k.currentRevision) issues.push({ level: 'info', text: 'รอตู้ใช้การตั้งค่าล่าสุด' });
  if (k.maintenance) issues.push({ level: 'info', text: 'ปิดปรับปรุง' });
  return issues;
}
