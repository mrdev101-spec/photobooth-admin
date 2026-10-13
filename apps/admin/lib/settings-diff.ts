/**
 * Field-level diff between two kiosk settings documents, for the revision history.
 * Arrays are compared as a whole; the admin PIN is reported as changed without its hash.
 */

export interface SettingChange {
  path: string;
  label: string;
  before: string;
  after: string;
}

export const SETTING_LABELS: Record<string, string> = {
  appMode: 'โหมดตู้',
  'identity.name': 'ชื่อตู้บนหน้าจอ',
  'identity.location': 'สถานที่',
  'identity.pickupStationName': 'ชื่อจุดรับรูป',
  'products.photo.sell': 'ขายภาพ 4x6',
  'products.photo.price': 'ราคาภาพ 4x6',
  'products.badge.sell': 'ขายเข็มกลัด',
  'products.badge.price': 'ราคาเข็มกลัด',
  'products.bundle.sell': 'ขายภาพ + เข็มกลัด',
  'products.bundle.price': 'ราคาภาพ + เข็มกลัด',
  'products.classic.newspaper': 'ราคา The Daily News',
  'products.classic.receipt': 'ราคา Classic Receipt',
  'products.classic.filmstrip': 'ราคา Film Strip',
  'products.classic.polaroid': 'ราคา Polaroid',
  'products.ai.price': 'ราคา AI ต่อครั้ง',
  'products.ai.allowRegenerate': 'ให้สร้างภาพ AI ใหม่',
  photoFulfillment: 'การรับภาพ',
  'brand.brandName': 'ชื่อแบรนด์',
  'brand.photoTitle': 'หัวข้อหน้าแรก',
  'brand.photoTagline': 'คำโปรย',
  'brand.printBranding': 'ชื่อแบรนด์บนภาพ',
  'attract.showBadges': 'ตัวอย่างเข็มกลัดหน้าแรก',
  'event.preset': 'ธีมงาน',
  'event.title': 'ชื่องาน',
  'event.subtitle': 'ข้อความรอง',
  'event.date': 'วันที่บนภาพ',
  'event.accent': 'สีธีม',
  'templates.photoLayouts': 'กรอบภาพ 4x6 ที่เปิด',
  'templates.photoDefaultLayout': 'กรอบ 4x6 เริ่มต้น',
  'templates.badgeFrames': 'กรอบเข็มกลัดที่เปิด',
  'templates.badgeDefaultFrame': 'กรอบเข็มกลัดเริ่มต้น',
  'templates.aiScenes': 'ฉาก AI ที่เปิด',
  'templates.classic': 'แบบ Classic ที่เปิด',
  'badge.size': 'ขนาดเข็มกลัด',
  'badge.copies': 'จำนวนเข็มกลัดต่อออเดอร์',
  'print.enabled': 'เปิดการพิมพ์ที่ตู้',
  'phoneUpload.enabled': 'รูปจากมือถือ',
  'motion.enabled': 'ภาพเคลื่อนไหว (ดุ๊กดิ๊ก)',
  'gesture.palmStart': 'ชูมือเริ่มถ่าย',
  'print.noPrintNote': 'ข้อความหน้ารับภาพ',
  'print.photo': 'ตู้พิมพ์ภาพ',
  'print.badge': 'ตู้พิมพ์เข็มกลัด',
  'print.queueSlip': 'พิมพ์ใบคิว',
  'print.queuePrefix': 'ตัวอักษรหน้าเลขคิว',
  'print.queueOnPhoto': 'เลขคิวบนภาพ',
  'paper.classic': 'กระดาษใบเสร็จ Classic',
  'paper.ai': 'กระดาษ AI Studio',
  'paper.photo': 'กระดาษภาพ',
  'paper.badge': 'กระดาษเข็มกลัด',
  'sound.voiceGuide': 'เสียงพูดแนะนำ',
  'sound.voiceVolume': 'ระดับเสียงพูด (%)',
  'sound.musicOn': 'เพลงหน้าแรก',
  'sound.musicTrack': 'เพลง',
  'sound.musicVolume': 'ระดับเสียงเพลง (%)',
  'payment.enabled': 'รับเงิน',
  'payment.bypass': 'ใช้ฟรี (ไม่เก็บเงิน)',
  'payment.mode': 'โหมดรับเงิน',
  'payment.email': 'อีเมลใบเสร็จ',
  'payment.qrTimeoutSec': 'เวลาหมดอายุ QR (วินาที)',
  'ai.demoMode': 'โหมดสาธิต AI',
  'share.enabled': 'QR ดาวน์โหลดภาพ',
  'share.retentionDays': 'เก็บภาพ (วัน)',
  idleReturnSec: 'กลับหน้าแรกเมื่อไม่มีการใช้งาน (วินาที)',
  adminPin: 'รหัสผู้ดูแลตู้'
};

function show(v: unknown): string {
  if (v === undefined || v === null || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'เปิด' : 'ปิด';
  if (Array.isArray(v)) return v.length ? v.join(', ') : 'ทั้งหมด';
  return String(v);
}

function flatten(obj: unknown, prefix = '', out: Record<string, unknown> = {}): Record<string, unknown> {
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${k}` : k;
      if (path === 'adminPin') out[path] = v ? (v as { hash?: string }).hash ?? 'set' : null;
      else flatten(v, path, out);
    }
  } else {
    out[prefix] = obj;
  }
  return out;
}

export function diffSettings(before: unknown, after: unknown): SettingChange[] {
  const a = flatten(before);
  const b = flatten(after);
  const changes: SettingChange[] = [];
  for (const path of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (JSON.stringify(a[path]) === JSON.stringify(b[path])) continue;
    const label = SETTING_LABELS[path] ?? path;
    if (path === 'adminPin') {
      changes.push({ path, label, before: a[path] ? 'ตั้งไว้' : 'ไม่มี', after: b[path] ? (a[path] ? 'เปลี่ยนใหม่' : 'ตั้งไว้') : 'ไม่มี' });
    } else {
      changes.push({ path, label, before: show(a[path]), after: show(b[path]) });
    }
  }
  return changes;
}
