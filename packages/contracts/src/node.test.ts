import { describe, expect, it } from 'vitest';
import { hashAdminPin, openSecrets, sealSecrets, verifyAdminPin } from './node';
import type { KioskSecrets } from './kiosk-api';

const secrets: KioskSecrets = {
  version: 3,
  r2: { accountId: 'acc', endpoint: 'https://acc.r2.cloudflarestorage.com', bucket: 'b', accessKeyId: 'AK', secretAccessKey: 'secret-key-value-123', publicUrl: 'https://img.example.com' }
};

describe('sealed secrets', () => {
  it('round-trips with the same device token', () => {
    const sealed = sealSecrets(secrets, 'token-abc');
    expect(sealed.ciphertext).not.toContain('secret-key-value-123');
    expect(openSecrets(sealed, 'token-abc')).toEqual(secrets);
  });

  it('cannot be opened with another kiosk token', () => {
    expect(() => openSecrets(sealSecrets(secrets, 'token-abc'), 'token-xyz')).toThrow();
  });
});

describe('admin PIN', () => {
  it('verifies the right PIN only', () => {
    const stored = hashAdminPin('482913', 1000);
    expect(verifyAdminPin('482913', stored)).toBe(true);
    expect(verifyAdminPin('482914', stored)).toBe(false);
  });

  it('salts every hash', () => {
    expect(hashAdminPin('1234', 1000).hash).not.toBe(hashAdminPin('1234', 1000).hash);
  });
});
