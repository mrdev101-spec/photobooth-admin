import Link from 'next/link';
import { Badge, EmptyState, Table, Td, Th } from './ui';
import { formatDateTime } from '@/lib/format';

export interface AuditRow {
  id: string;
  at: Date;
  action: string;
  resourceType: string;
  resourceId: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  actingAsPlatform: boolean;
  userName: string | null;
  userEmail: string | null;
}

const ACTION_LABELS: Record<string, string> = {
  'org.create': 'สร้างบัญชีลูกค้า',
  'org.update': 'แก้ไขบัญชีลูกค้า',
  'org.suspend': 'ระงับบัญชีลูกค้า',
  'org.reactivate': 'เปิดใช้บัญชีลูกค้า',
  'org.live_payments': 'เปลี่ยนสิทธิ์รับเงินจริง',
  'branch.create': 'เพิ่มสาขา',
  'branch.update': 'แก้ไขสาขา',
  'branch.deactivate': 'ปิดสาขา',
  'branch.reactivate': 'เปิดสาขา',
  'member.add': 'เพิ่มสมาชิก',
  'member.update': 'แก้ไขสมาชิก',
  'member.remove': 'ลบสมาชิก',
  'member.password_reset': 'รีเซ็ตรหัสผ่าน',
  'kiosk.create': 'เพิ่มตู้',
  'kiosk.update': 'แก้ไขตู้',
  'kiosk.pair_code': 'สร้างรหัสจับคู่',
  'kiosk.unpair': 'ยกเลิกการเชื่อมต่อตู้',
  'kiosk.accept_fingerprint': 'ยอมรับเครื่องใหม่ของตู้',
  'kiosk.maintenance_on': 'ปิดปรับปรุงตู้',
  'kiosk.maintenance_off': 'เปิดรับลูกค้า',
  'kiosk.delete': 'ลบตู้',
  'config.publish': 'บันทึกการตั้งค่าตู้',
  'config.rollback': 'ย้อนการตั้งค่าตู้',
  'storage.update': 'ตั้งพื้นที่เก็บภาพ',
  'storage.test': 'ทดสอบพื้นที่เก็บภาพ',
  'kiosk.enable': 'เปิดการใช้งานตู้',
  'kiosk.disable': 'ปิดการใช้งานตู้',
  'order.claim': 'รับออเดอร์ไปพิมพ์',
  'order.reprint_claim': 'พิมพ์ซ้ำ (ใช้สิทธิ์ที่อนุญาต)',
  'order.hand_over': 'ส่งมอบรูปแล้ว',
  'order.allow_reprint': 'อนุญาตพิมพ์ซ้ำ',
  'template.retire': 'เลิกใช้ template',
  'template.publish': 'เปิดใช้ template',
  'template.create': 'สร้าง template',
  'template.update': 'แก้ข้อมูล template',
  'template.version_publish': 'เผยแพร่เวอร์ชัน template',
  'template.rollback': 'ย้อนเวอร์ชัน template',
  'template.discard_draft': 'ยกเลิกร่าง template',
  'org.limits': 'แก้ขีดจำกัดและสิทธิ์'
};

function Change({ before, after }: { before: unknown; after: unknown }) {
  if (before == null && after == null) return <span className="text-ink-500">—</span>;
  return (
    <details>
      <summary className="cursor-pointer text-ink-600">ดูรายละเอียด</summary>
      <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
        {before != null ? <pre className="overflow-x-auto rounded bg-ink-50 p-2">{JSON.stringify(before, null, 2)}</pre> : null}
        {after != null ? <pre className="overflow-x-auto rounded bg-ink-50 p-2">{JSON.stringify(after, null, 2)}</pre> : null}
      </div>
    </details>
  );
}

export function AuditTable({ rows, nextHref }: { rows: AuditRow[]; nextHref?: string }) {
  if (!rows.length) return <EmptyState title="ยังไม่มีรายการ" />;
  return (
    <>
      <Table>
        <thead>
          <tr>
            <Th>เวลา</Th>
            <Th>ผู้ทำ</Th>
            <Th>รายการ</Th>
            <Th>การเปลี่ยนแปลง</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="align-top">
              <Td className="whitespace-nowrap">{formatDateTime(r.at)}</Td>
              <Td>
                <div className="font-medium">{r.userName ?? '—'}</div>
                <div className="text-xs text-ink-500">{r.userEmail}</div>
                {r.actingAsPlatform ? <Badge tone="platform">ทีมแพลตฟอร์ม</Badge> : null}
              </Td>
              <Td>
                <div>{ACTION_LABELS[r.action] ?? r.action}</div>
                <div className="text-xs text-ink-500">
                  {r.resourceType}
                  {r.resourceId ? ` · ${r.resourceId}` : ''}
                </div>
              </Td>
              <Td className="min-w-64">
                <Change before={r.before} after={r.after} />
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      {nextHref ? (
        <div className="mt-4">
          <Link href={nextHref} className="text-sm text-ink-600 underline">
            ถัดไป
          </Link>
        </div>
      ) : null}
    </>
  );
}
