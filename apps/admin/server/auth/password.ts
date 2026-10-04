import { hash, verify } from '@node-rs/argon2';

// argon2id, OWASP-recommended baseline (19 MiB, 2 passes)
const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export const PASSWORD_MIN = 10;

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTIONS);
}

export async function verifyPassword(hashed: string, plain: string): Promise<boolean> {
  try {
    return await verify(hashed, plain);
  } catch {
    return false;
  }
}

/** Returns a Thai message when the password is too weak, otherwise null. */
export function passwordProblem(plain: string, email?: string): string | null {
  if (plain.length < PASSWORD_MIN) return `รหัสผ่านต้องยาวอย่างน้อย ${PASSWORD_MIN} ตัวอักษร`;
  if (plain.length > 200) return 'รหัสผ่านยาวเกินไป';
  if (email && plain.toLowerCase().includes(email.split('@')[0]!.toLowerCase())) return 'รหัสผ่านต้องไม่มีชื่อผู้ใช้อยู่ในนั้น';
  if (/^(.)\1+$/.test(plain)) return 'รหัสผ่านง่ายเกินไป';
  return null;
}
