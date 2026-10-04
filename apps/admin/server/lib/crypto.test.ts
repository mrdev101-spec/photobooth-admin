import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret, maskSecret, randomToken, sha256Hex, temporaryPassword } from './crypto';
import { newId, slugify } from './ids';

describe('secret encryption', () => {
  const key = randomBytes(32);

  it('round-trips and uses a fresh IV every time', () => {
    const a = encryptSecret('sk_live_123', key);
    const b = encryptSecret('sk_live_123', key);
    expect(a).not.toBe(b);
    expect(decryptSecret(a, key)).toBe('sk_live_123');
  });

  it('rejects tampered ciphertext and the wrong key', () => {
    const sealed = encryptSecret('secret', key);
    const parts = sealed.split(':');
    parts[3] = Buffer.from('x').toString('base64url');
    expect(() => decryptSecret(parts.join(':'), key)).toThrow();
    expect(() => decryptSecret(sealed, randomBytes(32))).toThrow();
  });
});

describe('tokens and passwords', () => {
  it('makes url-safe tokens and hex hashes', () => {
    expect(randomToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(sha256Hex('a')).toHaveLength(64);
  });

  it('makes temporary passwords without look-alike characters', () => {
    const p = temporaryPassword();
    expect(p).toHaveLength(14);
    expect(p).not.toMatch(/[01OIlLoi]/);
  });

  it('masks secrets to the last 4 characters', () => {
    expect(maskSecret('sk_live_abcd1234')).toBe('••••1234');
    expect(maskSecret('abc')).toBe('••••');
  });
});

describe('ids', () => {
  it('prefixes ids and keeps them within VARCHAR(32)', () => {
    const id = newId('org');
    expect(id).toMatch(/^org_[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(id.length).toBeLessThanOrEqual(32);
  });

  it('slugifies names, falling back for Thai names', () => {
    expect(slugify('Party Booth Co., Ltd.')).toBe('party-booth-co-ltd');
    expect(slugify('ร้านถ่ายรูป')).toMatch(/^org-[0-9a-z]{6}$/);
  });
});
