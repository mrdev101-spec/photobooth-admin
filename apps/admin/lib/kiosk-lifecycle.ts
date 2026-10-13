/**
 * Where a kiosk is in its life, for the Platform's kiosk pages:
 *   คลัง: เพิ่มเข้าคลัง → ทดสอบ (Key ช่าง) → รีเซ็ตและล็อก (พร้อมส่ง)
 *   ร้าน: มอบให้ร้าน (Key) → ร้านลงทะเบียน → ใช้งาน
 * A kiosk registered straight for a shop starts at "มอบให้ร้าน".
 */

export type KioskStage =
  | 'stock_new' // in stock, never registered: issue a key for the technician
  | 'stock_testing' // in stock and registered: the technician is testing
  | 'stock_ready' // in stock, reset and locked: ready to hand to a shop
  | 'shop_waiting' // given to a shop, waiting for it to register (key issued / to issue)
  | 'shop_active' // in use at the shop
  | 'shop_disabled' // switched off by the platform
  | 'shop_locked' // reset and locked at the shop: register again or return to stock
  | 'archived'; // retired (ยกเลิกตู้), kept as history

export interface StageKiosk {
  status: 'pending' | 'active' | 'disabled' | 'revoked';
  archivedAt: Date | null;
  pairedAt: Date | null;
}

export function kioskStage(k: StageKiosk, inStock: boolean): KioskStage {
  if (k.archivedAt) return 'archived';
  if (inStock) {
    if (k.status === 'active' || k.status === 'disabled') return 'stock_testing';
    if (k.status === 'revoked' || k.pairedAt) return 'stock_ready';
    return 'stock_new';
  }
  if (k.status === 'active') return 'shop_active';
  if (k.status === 'disabled') return 'shop_disabled';
  if (k.status === 'revoked') return 'shop_locked';
  return 'shop_waiting';
}

export type StageTone = 'info' | 'warning' | 'success' | 'danger' | 'neutral';

export const STAGE_INFO: Record<KioskStage, { label: string; tone: StageTone; next: string }> = {
  stock_new: { label: 'ในคลัง • รอทดสอบ', tone: 'info', next: 'ออก Key ให้ช่าง ลงทะเบียนที่ตู้แล้วทดสอบกล้องและเครื่องพิมพ์' },
  stock_testing: { label: 'ในคลัง • กำลังทดสอบ', tone: 'info', next: 'ทดสอบเสร็จแล้วกด "รีเซ็ตและล็อก" ตู้จะพร้อมส่งให้ร้าน' },
  stock_ready: { label: 'ในคลัง • พร้อมส่ง', tone: 'success', next: 'เลือกร้านและสาขา แล้วกด "มอบให้ร้าน" จะได้ Key ให้ร้านลงทะเบียน' },
  shop_waiting: { label: 'รอร้านลงทะเบียน', tone: 'warning', next: 'ส่ง Key ให้ร้าน ร้านกรอกที่หน้าล็อกของตู้ (URL ของ Admin + Key)' },
  shop_active: { label: 'ใช้งานอยู่', tone: 'success', next: 'ตู้ทำงานปกติ • ตั้งค่าได้ที่แท็บ "การตั้งค่า"' },
  shop_disabled: { label: 'ปิดใช้งานโดยแพลตฟอร์ม', tone: 'danger', next: 'ตู้ไม่รับลูกค้าและไม่รับเงิน • เปิดกลับได้ทันที' },
  shop_locked: { label: 'รีเซ็ตและล็อกแล้ว', tone: 'warning', next: 'ออก Key ใหม่ให้ร้านลงทะเบียนอีกครั้ง หรือคืนเข้าคลัง' },
  archived: { label: 'ยกเลิกแล้ว • เก็บเป็นประวัติ', tone: 'neutral', next: 'ข้อมูลเดิมยังดูได้ครบ • นำกลับมาใช้ได้' }
};

export const JOURNEY = ['เข้าคลัง', 'ทดสอบ', 'ล็อกพร้อมส่ง', 'มอบให้ร้าน', 'ร้านลงทะเบียน', 'ใช้งาน'] as const;

/** The journey step this stage is at (earlier steps are done). */
export function journeyStep(stage: KioskStage): number {
  switch (stage) {
    case 'stock_new':
      return 0;
    case 'stock_testing':
      return 1;
    case 'stock_ready':
      return 2;
    case 'shop_waiting':
    case 'shop_locked':
      return 4;
    default:
      return 5;
  }
}

/** Tabs of the Platform kiosk list. */
export const KIOSK_TABS = [
  { id: 'all', label: 'ทั้งหมด' },
  { id: 'stock', label: 'ในคลัง' },
  { id: 'shops', label: 'อยู่กับร้าน' },
  { id: 'attention', label: 'ต้องดูแล' },
  { id: 'archived', label: 'ยกเลิกแล้ว' }
] as const;
export type KioskTab = (typeof KIOSK_TABS)[number]['id'];

export function inTab(tab: KioskTab, stage: KioskStage, needsAttention: boolean): boolean {
  if (tab === 'archived') return stage === 'archived';
  if (stage === 'archived') return false;
  if (tab === 'stock') return stage.startsWith('stock_');
  if (tab === 'shops') return stage.startsWith('shop_');
  if (tab === 'attention') return needsAttention || stage === 'shop_disabled' || stage === 'shop_locked';
  return true;
}

/** Audit actions in a kiosk's history, in words. */
export const TIMELINE_LABEL: Record<string, string> = {
  'kiosk.create': 'เพิ่มตู้',
  'kiosk.key': 'ออก Key ลงทะเบียน',
  'kiosk.pair_code': 'สร้างรหัสจับคู่',
  'kiosk.move': 'ย้ายตู้',
  'kiosk.unpair': 'รีเซ็ตและล็อก / ยกเลิกการเชื่อมต่อ',
  'kiosk.disable': 'ปิดการใช้งาน',
  'kiosk.enable': 'เปิดการใช้งาน',
  'kiosk.update': 'แก้ชื่อหรือสาขา',
  'kiosk.archive': 'ยกเลิกตู้ (เก็บเป็นประวัติ)',
  'kiosk.restore': 'นำกลับมาใช้',
  'kiosk.accept_fingerprint': 'ยอมรับเครื่องใหม่',
  'kiosk.maintenance_on': 'ปิดปรับปรุง',
  'kiosk.maintenance_off': 'เปิดรับลูกค้า',
  'config.publish': 'บันทึกการตั้งค่า',
  'config.rollback': 'ย้อนการตั้งค่า'
};
