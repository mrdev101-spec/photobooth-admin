import { AI_SCENES, CLASSIC_TEMPLATES } from '@photobooth/catalog';
import type { Tone } from '@/components/ui';

/** Thai labels for what was sold (product ids come from the kiosk). */
export const PRODUCT_LABELS: Record<string, string> = {
  photo: 'ภาพ 4x6',
  badge: 'เข็มกลัด',
  bundle: 'ภาพ + เข็มกลัด',
  ...Object.fromEntries(CLASSIC_TEMPLATES.map((t) => [t.id, `Classic: ${t.name}`])),
  ...Object.fromEntries(AI_SCENES.map((s) => [s.id, `AI: ${s.name}`]))
};

/** Label for a sold product; ids from a newer kiosk still read sensibly ("AI: new-scene"). */
export function productLabel(product: string, mode?: string): string {
  if (PRODUCT_LABELS[product]) return PRODUCT_LABELS[product];
  if (mode === 'ai') return `AI: ${product}`;
  if (mode === 'classic') return `Classic: ${product}`;
  return product;
}

export const STATUS_LABELS: Record<string, { label: string; tone: Tone }> = {
  uploaded: { label: 'รอรับ', tone: 'warning' },
  claimed: { label: 'กำลังพิมพ์', tone: 'info' },
  handed_over: { label: 'ส่งมอบแล้ว', tone: 'success' },
  printed_at_kiosk: { label: 'พิมพ์ที่ตู้แล้ว', tone: 'success' },
  expired: { label: 'หมดอายุ', tone: 'neutral' },
  cancelled: { label: 'ยกเลิก', tone: 'neutral' }
};

/** A kiosk-printed order that has not reported its print yet. */
export function statusLabel(status: string, fulfillment: 'kiosk' | 'pickup') {
  if (status === 'uploaded' && fulfillment === 'kiosk') return { label: 'กำลังพิมพ์ที่ตู้', tone: 'info' as Tone };
  return STATUS_LABELS[status] ?? { label: status, tone: 'neutral' as Tone };
}

/** Problems flagged when the kiosk reported the order. */
export const FLAG_LABELS: Record<string, string> = {
  live_not_allowed: 'ตู้รับเงินจริงทั้งที่บัญชียังไม่ได้รับอนุญาต'
};

export const PAYMENT_LABELS: Record<string, { label: string; tone: Tone }> = {
  live: { label: 'เงินจริง', tone: 'success' },
  test: { label: 'ทดสอบ', tone: 'violet' },
  simulated: { label: 'จำลอง', tone: 'info' },
  free: { label: 'ฟรี', tone: 'neutral' }
};
