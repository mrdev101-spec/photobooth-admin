/**
 * Which parts of a kiosk's settings a customer may change (docs §17.4). Set per customer by
 * the platform team; every kiosk of the customer uses the same set. The platform team can
 * always edit everything. Pure module: used by the config editor and by the server check.
 */

export type PermissionLevel = 'edit' | 'view' | 'hidden';

export const CONFIG_SECTIONS = [
  { id: 'identity', label: 'ตัวตนตู้', desc: 'ชื่อตู้ สถานที่ ชื่อจุดรับรูป', paths: ['identity'] },
  { id: 'brand', label: 'แบรนด์และธีมงาน', desc: 'ชื่อแบรนด์ หัวข้อ ชื่องาน สีธีม ตัวอย่างเข็มกลัดหน้าแรก', paths: ['brand', 'event', 'attract'] },
  { id: 'products', label: 'สินค้าและราคา', desc: 'สินค้าที่ขาย ราคา (รวม Classic และ AI) การรับภาพ', paths: ['products', 'photoFulfillment'] },
  { id: 'templates', label: 'กรอบภาพและฉาก AI', desc: 'กรอบ 4x6 กรอบเข็มกลัด แบบ Classic ฉาก AI ที่เปิด', paths: ['templates'] },
  { id: 'decor', label: 'ข้อความตกแต่ง', desc: 'ข้อความของร้านบนกรอบ 4x6 และเข็มกลัด (ฟอนต์ สี ตำแหน่ง)', paths: ['decor'] },
  { id: 'badge', label: 'เข็มกลัด', desc: 'ขนาดและจำนวนต่อออเดอร์', paths: ['badge'] },
  { id: 'print', label: 'การพิมพ์และใบคิว', desc: 'สิ่งที่ตู้พิมพ์ ใบคิว หมายเลขคิวบนภาพ', paths: ['print'] },
  { id: 'paper', label: 'กระดาษ', desc: 'ขนาดกระดาษ (4x6 / A4 / A5) การจัดวางบนแผ่น A4/A5 และกระดาษเข็มกลัด • ค่าเริ่มต้น ตู้ปรับเองได้', paths: ['paper'] },
  { id: 'sound', label: 'เสียงและเพลง', desc: 'เสียงพูดแนะนำ เพลงหน้าแรก ระดับเสียง • ค่าเริ่มต้น ตู้ปรับเองได้', paths: ['sound'] },
  { id: 'share', label: 'ดาวน์โหลดภาพ (QR)', desc: 'เปิด QR และจำนวนวันที่เก็บภาพ', paths: ['share'] },
  { id: 'phone', label: 'ลูกเล่นตอนถ่าย', desc: 'รูปจากมือถือ ภาพเคลื่อนไหว (ดุ๊กดิ๊ก) และชูมือเริ่มถ่าย', paths: ['phoneUpload', 'motion', 'gesture'] },
  { id: 'behavior', label: 'พฤติกรรมตู้และรหัสผู้ดูแล', desc: 'เวลากลับหน้าแรก รหัสเข้าหน้า Config ของตู้', paths: ['idleReturnSec', 'adminPin'] },
  { id: 'mode', label: 'โหมดตู้', desc: 'Classic / AI Studio / Photo 4x6 / จุดรับรูป', paths: ['appMode'] },
  { id: 'payment', label: 'การรับเงิน', desc: 'เปิดรับเงิน ใช้ฟรี โหมด อีเมล เวลาหมดอายุ QR', paths: ['payment'] },
  { id: 'ai', label: 'AI (โหมดสาธิต)', desc: 'จำลองผล AI ในตู้', paths: ['ai'] }
] as const;

export type ConfigSectionId = (typeof CONFIG_SECTIONS)[number]['id'];
export type ConfigPermissions = Record<ConfigSectionId, PermissionLevel>;

/** Decision D13: customers edit their event-facing settings; hardware-, money- and cost-bound ones are view-only. */
export const DEFAULT_CONFIG_PERMISSIONS: ConfigPermissions = {
  identity: 'edit',
  brand: 'edit',
  products: 'edit',
  templates: 'edit',
  badge: 'edit',
  print: 'edit',
  paper: 'edit',
  decor: 'edit',
  sound: 'edit',
  share: 'edit',
  phone: 'edit',
  behavior: 'edit',
  mode: 'view',
  payment: 'view',
  ai: 'view'
};

export const PERMISSION_LABELS: Record<PermissionLevel, string> = { edit: 'แก้ได้', view: 'ดูอย่างเดียว', hidden: 'ซ่อน' };

const LEVELS = new Set<PermissionLevel>(['edit', 'view', 'hidden']);

/** Stored value (possibly partial or null) merged over the defaults. */
export function resolvePermissions(stored: Partial<Record<string, unknown>> | null | undefined): ConfigPermissions {
  const out = { ...DEFAULT_CONFIG_PERMISSIONS };
  for (const s of CONFIG_SECTIONS) {
    const v = stored?.[s.id];
    if (typeof v === 'string' && LEVELS.has(v as PermissionLevel)) out[s.id] = v as PermissionLevel;
  }
  return out;
}

/** Section of a settings path such as "products.photo.price" (longest matching prefix). */
export function sectionOf(path: string): ConfigSectionId | undefined {
  let best: { id: ConfigSectionId; len: number } | undefined;
  for (const s of CONFIG_SECTIONS) {
    for (const p of s.paths) {
      if ((path === p || path.startsWith(`${p}.`)) && (!best || p.length > best.len)) best = { id: s.id, len: p.length };
    }
  }
  return best?.id;
}

export function levelOf(perms: ConfigPermissions, path: string): PermissionLevel {
  const id = sectionOf(path);
  return id ? perms[id] : 'edit';
}

function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj);
}

/**
 * Sections a customer changed although they are not allowed to (not 'edit'). Compared by
 * JSON, so key order inside arrays matters as it does on the kiosk.
 */
export function lockedChanges(perms: ConfigPermissions, before: unknown, after: unknown): ConfigSectionId[] {
  const violations: ConfigSectionId[] = [];
  for (const s of CONFIG_SECTIONS) {
    if (perms[s.id] === 'edit') continue;
    const changed = s.paths.some((p) => JSON.stringify(getPath(before, p) ?? null) !== JSON.stringify(getPath(after, p) ?? null));
    if (changed) violations.push(s.id);
  }
  return violations;
}
