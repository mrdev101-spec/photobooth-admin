import { z } from 'zod';
import { APP_MODES } from '@photobooth/catalog';

/**
 * Orders (docs §18.5). The kiosk reports every sale; pickup orders also carry the 6-character
 * code printed on the slip. Code alphabet = the kiosk's (cloudShare.cjs): no 0/O, 1/I/L.
 */
export const PICKUP_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const PICKUP_CODE_LENGTH = 6;

/** `ZHK-6Q6` for people; stored and sent without the dash. */
export const formatPickupCode = (code: string) => (code.length === 6 ? `${code.slice(0, 3)}-${code.slice(3)}` : code);

/**
 * A code from what the pickup counter scanned or typed: the code itself (any case, with or
 * without dash/spaces) or the slip's QR, which is the download URL `…#p/<KioskID>/o/<CODE>/…`.
 * Returns null when it is not a valid code.
 */
export function parsePickupInput(input: string): { code: string; kioskId: string | null } | null {
  const text = String(input || '').trim().toUpperCase();
  const fromUrl = /[#/]P\/(?:(KS-[A-Z0-9]+)\/)?O\/([A-Z0-9]{6})\//.exec(text);
  const code = fromUrl ? fromUrl[2]! : text.replace(/[^A-Z0-9]/g, '');
  if (code.length !== PICKUP_CODE_LENGTH || [...code].some((ch) => !PICKUP_CODE_ALPHABET.includes(ch))) return null;
  return { code, kioskId: fromUrl?.[1] ?? null };
}

const httpUrl = z.url().max(1000).refine((u) => /^https?:\/\//i.test(u), 'ต้องเป็น http(s)');

export const OrderFileSchema = z.object({
  kind: z.enum(['photo', 'badge', 'shot', 'ai', 'receipt']),
  url: httpUrl,
  key: z.string().max(500).optional(),
  width: z.number().int().positive().max(20_000).optional(),
  height: z.number().int().positive().max(20_000).optional()
});

export const OrderInputSchema = z
  .object({
    clientOrderId: z.string().min(1).max(64),
    code: z
      .string()
      .max(10)
      .transform((v) => v.toUpperCase().replace(/[^A-Z0-9]/g, ''))
      .refine((v) => v.length === PICKUP_CODE_LENGTH && [...v].every((ch) => PICKUP_CODE_ALPHABET.includes(ch)), 'รหัสรับรูปไม่ถูกต้อง')
      .optional(),
    mode: z.enum(APP_MODES.map((m) => m.id) as [string, ...string[]]),
    /** photo | badge | bundle | a Classic template id | an AI scene id */
    product: z.string().min(1).max(40),
    templateId: z.string().max(64).optional(),
    items: z.array(z.object({ type: z.enum(['photo', 'badge', 'print']), qty: z.number().int().min(1).max(50) })).min(1).max(10),
    /** Whole baht, as everywhere in the kiosk API. */
    amount: z.number().int().min(0).max(1_000_000),
    payment: z.object({ kind: z.enum(['live', 'test', 'simulated', 'free']), ref: z.string().max(80).optional() }),
    fulfillment: z.enum(['kiosk', 'pickup']),
    files: z.array(OrderFileSchema).max(10).default([]),
    downloadUrl: httpUrl.optional(),
    badge: z.object({ size: z.string().max(8), copies: z.number().int().min(1).max(12), frame: z.string().max(64), cutMm: z.number().min(0).max(200).optional() }).optional(),
    orderedAt: z.iso.datetime(),
    expiresAt: z.iso.datetime().optional(),
    /** Kiosk-printed orders may report the print together with the order. */
    printedAt: z.iso.datetime().optional()
  })
  .superRefine((o, ctx) => {
    if (o.fulfillment === 'pickup') {
      if (!o.code) ctx.addIssue({ code: 'custom', path: ['code'], message: 'ออเดอร์จุดรับรูปต้องมีรหัส' });
      if (!o.files.some((f) => f.kind === 'photo' || f.kind === 'ai' || f.kind === 'badge')) ctx.addIssue({ code: 'custom', path: ['files'], message: 'ออเดอร์จุดรับรูปต้องมีไฟล์ภาพ' });
    }
  });
export type OrderInput = z.input<typeof OrderInputSchema>;

export interface OrderResponse {
  orderId: string;
  code: string | null;
  status: string;
}

export const OrderPrintedSchema = z.object({ printedAt: z.iso.datetime().optional(), printer: z.string().max(120).optional() });
