import { z } from 'zod';
import { APP_MODES } from '@photobooth/catalog';

/**
 * Kiosk API request/response shapes (docs/ADMIN_SYSTEM_DESIGN.md §7.2).
 * Identity formats come from the kiosk (photobooth-v1 kioskSystem.cjs):
 *   kioskId      "KS-" + 8 hex, generated once per install
 *   fingerprint  16 hex from sha256(Windows MachineGuid)
 */

export const KioskIdSchema = z.string().regex(/^KS-[0-9A-F]{8}$/, 'Kiosk ID ไม่ถูกต้อง');
export const FingerprintSchema = z.string().regex(/^[0-9A-F]{16}$/, 'fingerprint ไม่ถูกต้อง');

/** 8 characters without look-alikes (no 0/O, 1/I/L); shown as XXXX-XXXX. */
export const PAIR_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const PAIR_CODE_LENGTH = 8;

export function normalizePairCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, '');
}

export const PairRequestSchema = z.object({
  pairCode: z.string().min(1).max(20).transform(normalizePairCode),
  kioskId: KioskIdSchema,
  fingerprint: FingerprintSchema,
  hostname: z.string().max(255).default(''),
  appVersion: z.string().max(40).default('')
});
export type PairRequest = z.input<typeof PairRequestSchema>;

export interface PairResponse {
  deviceToken: string;
  kioskId: string;
  name: string;
  org: { name: string };
  branch: { id: string; name: string } | null;
  revision: number;
}

const PRINTER_ROLES = ['main', 'photo', 'badge'] as const;

export const HeartbeatRequestSchema = z.object({
  mode: z.enum(APP_MODES.map((m) => m.id) as [string, ...string[]]),
  screen: z.string().max(64).default(''),
  revision: z.number().int().min(0).default(0),
  appVersion: z.string().max(40).default(''),
  ip: z.string().max(64).optional(),
  fingerprint: FingerprintSchema.optional(),
  hostname: z.string().max(255).optional(),
  printers: z
    .array(
      z.object({
        role: z.enum(PRINTER_ROLES),
        name: z.string().max(255),
        ok: z.boolean(),
        error: z.string().max(500).optional()
      })
    )
    .max(10)
    .default([]),
  camera: z
    .object({
      source: z.enum(['webcam', 'digicam']),
      ok: z.boolean(),
      error: z.string().max(500).optional()
    })
    .optional(),
  queueDepth: z.number().int().min(0).default(0),
  /** The kiosk-owned (hardware) settings: printers, camera, badge calibration. No secrets. */
  localSettings: z.record(z.string(), z.unknown()).optional(),
  /**
   * Emergency mode: staff unlocked the Admin-owned settings at the kiosk with the admin PIN.
   * `changes` = kiosk config keys that now differ from the Admin's values. Absent = off.
   */
  emergency: z
    .object({
      since: z.iso.datetime(),
      changes: z.array(z.object({ key: z.string().max(64), value: z.unknown() })).max(60).default([])
    })
    .optional()
});
export type HeartbeatRequest = z.input<typeof HeartbeatRequestSchema>;
export type HeartbeatData = z.output<typeof HeartbeatRequestSchema>;

// ─── Config (Phase 2) ────────────────────────────────────────────────────────

/** Admin PIN as sent to the kiosk (see node.ts for the hash recipe). */
export interface AdminPin {
  algo: 'pbkdf2-sha256';
  iterations: number;
  salt: string;
  hash: string;
}

/** Plaintext inside `secrets`: same field names as the kiosk's data/share-config.json. */
export interface KioskSecrets {
  version: number;
  r2: {
    accountId: string;
    endpoint: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    publicUrl: string;
  } | null;
}

export interface SealedSecrets {
  alg: 'A256GCM';
  kdf: 'HKDF-SHA256';
  info: string;
  iv: string;
  tag: string;
  ciphertext: string;
}

/** GET /kiosk/config?since={rev} → 304 when `since` is already the latest revision. */
export interface KioskConfigResponse {
  kioskId: string;
  revision: number;
  updatedAt: string;
  settings: import('./kiosk-settings').KioskSettings;
  /** Encrypted with the device token (node.ts openSecrets); null when the customer has no storage yet. */
  secrets: SealedSecrets | null;
  assets: { manifestRevision: number };
}

/**
 * POST /kiosk/config/import: a kiosk that was in use before pairing sends its own settings once,
 * so the Admin starts from them instead of the defaults. Only accepted while the kiosk still has
 * the revision created at pairing.
 */
export const ConfigImportSchema = z.object({ settings: z.record(z.string(), z.unknown()) });
export interface ConfigImportResponse {
  revision: number;
  /** Values the Admin could not keep (e.g. live payments not allowed for this customer). */
  adjusted: string[];
}

export const ConfigAckSchema = z
  .object({
    revision: z.number().int().min(1),
    status: z.enum(['applied', 'rejected']),
    appliedAt: z.iso.datetime().optional(),
    error: z.object({ code: z.string().max(16).optional(), message: z.string().max(1000) }).optional()
  })
  .refine((v) => v.status === 'applied' || !!v.error, { path: ['error'], message: 'rejected ต้องมี error' });
export type ConfigAck = z.input<typeof ConfigAckSchema>;

export interface KioskCommand {
  id: string;
  type: 'sync_config' | 'test_print' | 'upload_logs' | 'restart_app' | 'set_maintenance' | 'allow_reprint' | 'reprint' | 'cancel_print';
  payload: Record<string, unknown>;
}

export interface HeartbeatResponse {
  serverTime: string;
  /** Who the kiosk belongs to now (it can be moved between the stock and customers). */
  account?: { org: string; stock: boolean; kiosk: string; branch: string | null };
  latestRevision: number;
  manifestRevision: number;
  /** Maintenance screen on/off (set by the Admin). */
  maintenance: boolean;
  /** The customer account is suspended: finish the current customer, then show maintenance. */
  suspended: boolean;
  /**
   * Switched off by the platform (e.g. unpaid, contract ended, stolen). Finish the current
   * customer, then show `disabledMessage` and accept no new customers or payments. Keep the
   * device token: the kiosk comes back by itself when the platform switches it on again.
   */
  disabled: boolean;
  disabledMessage: string | null;
  commands: KioskCommand[];
}

// ─── Realtime: GET /kiosk/wait (long poll) ───────────────────────────────────

/**
 * Answers as soon as something is new for the kiosk (newer settings, templates, commands), or
 * after about 25 s with `changed: false`; the kiosk asks again straight away.
 */
export interface KioskWaitResponse {
  changed: boolean;
  revision: number;
  manifestRevision: number;
  commands: KioskCommand[];
}

export const CommandResultSchema = z.object({
  status: z.enum(['done', 'failed']),
  message: z.string().max(500).optional()
});

// ─── AI through the Admin (docs §8.5) ────────────────────────────────────────

const imageDataUrl = z
  .string()
  .max(8_000_000)
  .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/, 'ต้องเป็นภาพ JPEG / PNG / WebP');

/** POST /kiosk/ai/jobs — one customer image. A retry with the same requestId gets the same job. */
export const AiJobRequestSchema = z.object({
  requestId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
  sceneId: z.string().regex(/^([a-z0-9-]{1,40}|tpl_[a-z0-9][a-z0-9_-]{1,58})$/),
  photo: imageDataUrl,
  faceCrop: imageDataUrl.optional(),
  /** The paid payment (Admin id) this image uses; omitted when the kiosk does not charge (free / simulated). */
  paymentId: z.string().regex(/^pay_[A-Za-z0-9]+$/).optional()
});
export type AiJobRequest = z.infer<typeof AiJobRequestSchema>;

/** GET /kiosk/ai/status — can this kiosk take AI customers now (checked before payment). */
export interface KioskAiStatus {
  available: boolean;
  /** Why not: the platform has no AI key, the month's quota is used up, or the account is suspended. */
  reason: 'not_configured' | 'quota' | 'suspended' | null;
  month: string;
  used: number;
  /** null = unlimited */
  quota: number | null;
  provider: string | null;
  model: string | null;
}

/** GET /kiosk/ai/jobs/{id} — the image itself is at /kiosk/ai/jobs/{id}/result once succeeded. */
export interface KioskAiJob {
  jobId: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  errorCode: string | null;
  errorMessage: string | null;
  durationMs: number | null;
  refined: boolean;
}

// ─── Payments through the Admin (docs §8.4) ──────────────────────────────────

/** POST /kiosk/payments — a PromptPay QR for one sale (amount in THB). */
export const PaymentCreateSchema = z.object({
  amount: z.number().int().min(10).max(10_000),
  product: z.string().trim().max(100).default(''),
  description: z.string().trim().max(200).default('')
});

/** GET /kiosk/payments/status — can the payment screen show a real QR now. */
export interface KioskPaymentStatus {
  enabled: boolean;
  ready: boolean;
  mode: 'test' | 'live';
  /** Whose Stripe account takes the money: the company's or the shop's own. */
  account: 'platform' | 'shop' | null;
  reason: 'disabled' | 'live_not_allowed' | 'no_account' | 'no_email' | null;
}

// ─── Photos from the customer's phone (POST /kiosk/uploads, GET /kiosk/uploads/{id}) ───

export const PHONE_UPLOAD_MAX_PHOTOS = 4;
export const PhoneUploadRequestSchema = z.object({ count: z.number().int().min(1).max(PHONE_UPLOAD_MAX_PHOTOS) });
export type PhoneUploadRequest = z.infer<typeof PhoneUploadRequestSchema>;

export interface PhoneUploadSession {
  id: string;
  /** The page the customer's phone opens (the QR). */
  url: string;
  count: number;
  expiresAt: string;
}

/**
 * When `ready`, the kiosk fetches GET /kiosk/uploads/{id}/photos/{i} (the image bytes, one per
 * request so no response is large), then DELETE /kiosk/uploads/{id} removes them here.
 */
export interface PhoneUploadState {
  status: 'waiting' | 'uploading' | 'ready' | 'taken' | 'cancelled' | 'expired';
  received: number;
  count: number;
}
