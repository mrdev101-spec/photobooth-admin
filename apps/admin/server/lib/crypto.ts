import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt } from 'node:crypto';

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** URL-safe random token (session cookies, device tokens). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

// No 0/O, 1/I/L — same rule as the kiosk's pickup codes, so codes read aloud without mistakes
const READABLE = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789abcdefghjkmnpqrstuvwxyz';

/** Temporary password shown once to an admin creating an account. */
export function temporaryPassword(length = 14): string {
  let out = '';
  for (let i = 0; i < length; i++) out += READABLE[randomInt(READABLE.length)];
  return out;
}

/** Random pairing code over `alphabet` (uniform: randomInt has no modulo bias). */
export function randomCode(alphabet: string, length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) out += alphabet[randomInt(alphabet.length)];
  return out;
}

/**
 * Secrets at rest (R2 / Stripe / AI keys): AES-256-GCM with MASTER_KEY (32 bytes, base64).
 * Format `v1:<iv>:<tag>:<ciphertext>` (base64url) so the key can be rotated later.
 */
function masterKey(): Buffer {
  const raw = process.env.MASTER_KEY;
  if (!raw) throw new Error('MASTER_KEY is not set');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('MASTER_KEY must be 32 bytes (base64)');
  return key;
}

export function encryptSecret(plain: string, key: Buffer = masterKey()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ct.toString('base64url')].join(':');
}

export function decryptSecret(sealed: string, key: Buffer = masterKey()): string {
  const [version, iv, tag, ct] = sealed.split(':');
  if (version !== 'v1' || !iv || !tag || ct === undefined) throw new Error('Unknown secret format');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ct, 'base64url')), decipher.final()]).toString('utf8');
}

/** Last 4 characters only, for showing that a secret is set. */
export function maskSecret(plain: string): string {
  return plain.length <= 4 ? '••••' : `••••${plain.slice(-4)}`;
}
