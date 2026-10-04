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
  type: 'sync_config' | 'test_print' | 'upload_logs' | 'restart_app' | 'set_maintenance' | 'allow_reprint';
  payload: Record<string, unknown>;
}

export interface HeartbeatResponse {
  serverTime: string;
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
