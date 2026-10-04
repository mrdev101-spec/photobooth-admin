/**
 * Node-only helpers shared by the Admin and the kiosk server (import from
 * `@photobooth/contracts/node`, never from browser code).
 *
 * 1. Sealed secrets — the R2 credentials inside GET /kiosk/config are encrypted with a key
 *    derived from the kiosk's own device token, so they never travel or sit in logs in clear:
 *      key = HKDF-SHA256(ikm = deviceToken (utf8), salt = empty, info = SECRETS_INFO, 32 bytes)
 *      AES-256-GCM, 12-byte random IV, base64url fields.
 * 2. Admin PIN — the Admin sends only a PBKDF2 hash; the kiosk compares locally:
 *      hash = base64(PBKDF2-SHA256(pin utf8, salt = base64-decoded `salt`, iterations, 32 bytes))
 */
import { createCipheriv, createDecipheriv, hkdfSync, pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';
import type { AdminPin, KioskSecrets, SealedSecrets } from './kiosk-api';

export const SECRETS_INFO = 'photobooth-kiosk-secrets-v1';

function secretsKey(deviceToken: string): Buffer {
  return Buffer.from(hkdfSync('sha256', Buffer.from(deviceToken, 'utf8'), Buffer.alloc(0), SECRETS_INFO, 32));
}

export function sealSecrets(secrets: KioskSecrets, deviceToken: string): SealedSecrets {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', secretsKey(deviceToken), iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(secrets), 'utf8'), cipher.final()]);
  return { alg: 'A256GCM', kdf: 'HKDF-SHA256', info: SECRETS_INFO, iv: iv.toString('base64url'), tag: cipher.getAuthTag().toString('base64url'), ciphertext: ct.toString('base64url') };
}

export function openSecrets(sealed: SealedSecrets, deviceToken: string): KioskSecrets {
  if (sealed.alg !== 'A256GCM' || sealed.kdf !== 'HKDF-SHA256' || sealed.info !== SECRETS_INFO) throw new Error('Unsupported sealed secrets format');
  const decipher = createDecipheriv('aes-256-gcm', secretsKey(deviceToken), Buffer.from(sealed.iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(sealed.tag, 'base64url'));
  const plain = Buffer.concat([decipher.update(Buffer.from(sealed.ciphertext, 'base64url')), decipher.final()]).toString('utf8');
  return JSON.parse(plain) as KioskSecrets;
}

export const PIN_ITERATIONS = 210_000;

export function hashAdminPin(pin: string, iterations = PIN_ITERATIONS): AdminPin {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(pin, salt, iterations, 32, 'sha256');
  return { algo: 'pbkdf2-sha256', iterations, salt: salt.toString('base64'), hash: hash.toString('base64') };
}

export function verifyAdminPin(pin: string, stored: AdminPin): boolean {
  const expected = Buffer.from(stored.hash, 'base64');
  const actual = pbkdf2Sync(pin, Buffer.from(stored.salt, 'base64'), stored.iterations, expected.length, 'sha256');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
