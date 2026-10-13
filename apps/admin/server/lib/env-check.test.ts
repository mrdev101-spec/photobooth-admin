import { describe, expect, it } from 'vitest';
import { checkProductionEnv } from './env-check';

const ok = {
  DATABASE_URL: 'mysql://u:p@db:3306/x',
  MASTER_KEY: Buffer.alloc(32, 7).toString('base64'),
  ADMIN_PUBLIC_URL: 'https://admin.example.com',
  DATABASE_SSL: 'true',
  CRON_SECRET: 's',
  RESEND_API_KEY: 're_x',
  EMAIL_FROM: 'SCLUO-DIO <no-reply@example.com>',
  PLATFORM_R2_ACCOUNT_ID: 'a', PLATFORM_R2_BUCKET: 'b', PLATFORM_R2_ACCESS_KEY_ID: 'c', PLATFORM_R2_SECRET_ACCESS_KEY: 'd', PLATFORM_R2_PUBLIC_URL: 'https://cdn'
};

describe('checkProductionEnv', () => {
  it('accepts a complete production env', () => {
    expect(checkProductionEnv(ok)).toEqual({ errors: [], warnings: [] });
  });
  it('requires the database, a 32-byte master key and an https public URL', () => {
    const r = checkProductionEnv({ ...ok, DATABASE_URL: '', MASTER_KEY: 'c2hvcnQ=', ADMIN_PUBLIC_URL: 'http://admin.example.com' });
    expect(r.errors).toHaveLength(3);
  });
  it('warns about seed passwords, missing cron secret and endpoint overrides', () => {
    const r = checkProductionEnv({ ...ok, CRON_SECRET: '', SEED_ADMIN_PASSWORD: 'x', STRIPE_API_BASE_URL: 'https://proxy' });
    expect(r.errors).toEqual([]);
    expect(r.warnings).toHaveLength(3);
  });
});
