import { describe, expect, it } from 'vitest';
import { hashPassword, passwordProblem, verifyPassword } from './password';

describe('passwords', () => {
  it('hashes with argon2id and verifies', async () => {
    const hashed = await hashPassword('correct horse battery');
    expect(hashed.startsWith('$argon2id$')).toBe(true);
    expect(await verifyPassword(hashed, 'correct horse battery')).toBe(true);
    expect(await verifyPassword(hashed, 'wrong')).toBe(false);
  });

  it('treats a malformed hash as a failed check', async () => {
    expect(await verifyPassword('not-a-hash', 'x')).toBe(false);
  });

  it('rejects weak passwords', () => {
    expect(passwordProblem('short')).not.toBeNull();
    expect(passwordProblem('aaaaaaaaaaaa')).not.toBeNull();
    expect(passwordProblem('somchai-2026-pass', 'somchai@example.com')).not.toBeNull();
    expect(passwordProblem('a-long-enough-pass')).toBeNull();
  });
});
