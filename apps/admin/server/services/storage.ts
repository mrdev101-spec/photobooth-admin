import 'server-only';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { KioskSecrets } from '@photobooth/contracts';
import { db } from '@/server/db/client';
import { orgStorage, type OrgStorage } from '@/server/db/schema';
import type { PlatformContext } from '@/server/auth/context';
import { audit } from '@/server/audit';
import { decryptSecret, encryptSecret } from '@/server/lib/crypto';
import { AppError } from '@/server/lib/errors';
import { r2Endpoint, testR2, type R2Credentials } from '@/server/lib/r2';
import { bumpAllKiosks } from './kiosk-config';
import { presignUrl } from '@/server/lib/r2-presign';

/** Per-customer R2 storage. Only the platform team sets it; customers see a read-only summary. */

export const StorageInput = z.object({
  accountId: z.string().trim().regex(/^[0-9a-f]{32}$/i, 'Account ID เป็นเลขฐาน 16 ยาว 32 ตัว'),
  bucket: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/, 'ชื่อ bucket ใช้ a-z 0-9 และ - (3-63 ตัว)'),
  endpoint: z.union([z.literal(''), z.url().startsWith('https://', 'ต้องเป็น https')]).default(''),
  publicUrl: z
    .url('URL ไม่ถูกต้อง')
    .startsWith('https://', 'ต้องเป็น https')
    .transform((u) => u.replace(/\/+$/, '')),
  accessKeyId: z.string().trim().max(128).default(''),
  secretAccessKey: z.string().trim().max(256).default(''),
  lifecycleDays: z.coerce.number().int().min(1).max(365)
});

export interface StorageSummary {
  configured: boolean;
  bucket?: string;
  publicUrl?: string;
  accountId?: string;
  endpoint?: string;
  keyHint?: string;
  lifecycleDays?: number;
  secretsVersion?: number;
  lastTestAt?: Date | null;
  lastTestOk?: boolean | null;
  lastTestError?: string | null;
  updatedAt?: Date;
}

async function row(orgId: string): Promise<OrgStorage | undefined> {
  return (await db().select().from(orgStorage).where(eq(orgStorage.orgId, orgId)).limit(1))[0];
}

/** Safe to show (no keys). */
export async function storageSummary(orgId: string): Promise<StorageSummary> {
  const r = await row(orgId);
  if (!r) return { configured: false };
  return {
    configured: true,
    bucket: r.bucket,
    publicUrl: r.publicUrl,
    accountId: r.accountId,
    endpoint: r.endpoint,
    keyHint: r.keyHint,
    lifecycleDays: r.lifecycleDays,
    secretsVersion: r.secretsVersion,
    lastTestAt: r.lastTestAt,
    lastTestOk: r.lastTestOk,
    lastTestError: r.lastTestError,
    updatedAt: r.updatedAt
  };
}

function credentialsOf(r: OrgStorage): R2Credentials {
  return {
    accountId: r.accountId,
    endpoint: r.endpoint,
    bucket: r.bucket,
    accessKeyId: decryptSecret(r.accessKeyIdEnc),
    secretAccessKey: decryptSecret(r.secretAccessKeyEnc)
  };
}

/**
 * Saves storage settings. Leaving both key fields empty keeps the stored keys. Any change
 * bumps `secrets_version` and gives every kiosk of the customer a new config revision, so
 * the kiosks pick up the new bucket/keys (e.g. after rotating a key when a kiosk is lost).
 */
export async function saveStorage(ctx: PlatformContext, orgId: string, input: z.infer<typeof StorageInput>) {
  const before = await row(orgId);
  const keysGiven = !!(input.accessKeyId || input.secretAccessKey);
  if (keysGiven && !(input.accessKeyId && input.secretAccessKey)) throw new AppError('กรอกทั้ง Access Key ID และ Secret Access Key');
  if (!before && !keysGiven) throw new AppError('กรอก Access Key ID และ Secret Access Key');

  const values = {
    accountId: input.accountId.toLowerCase(),
    bucket: input.bucket,
    endpoint: input.endpoint,
    publicUrl: input.publicUrl,
    lifecycleDays: input.lifecycleDays,
    ...(keysGiven
      ? {
          accessKeyIdEnc: encryptSecret(input.accessKeyId),
          secretAccessKeyEnc: encryptSecret(input.secretAccessKey),
          keyHint: input.accessKeyId.slice(-4)
        }
      : {}),
    lastTestAt: null,
    lastTestOk: null,
    lastTestError: null,
    updatedBy: ctx.user.id
  };

  const deliveryChanged =
    !before || keysGiven || before.accountId !== values.accountId || before.bucket !== values.bucket || before.endpoint !== values.endpoint || before.publicUrl !== values.publicUrl;

  if (before) {
    await db()
      .update(orgStorage)
      .set({ ...values, secretsVersion: deliveryChanged ? before.secretsVersion + 1 : before.secretsVersion })
      .where(eq(orgStorage.orgId, orgId));
  } else {
    await db().insert(orgStorage).values({ orgId, ...values, accessKeyIdEnc: values.accessKeyIdEnc!, secretAccessKeyEnc: values.secretAccessKeyEnc!, keyHint: values.keyHint! });
  }

  const bumped = deliveryChanged ? await bumpAllKiosks(orgId, ctx.user.id, 'อัปเดตพื้นที่เก็บภาพ (R2)') : 0;
  await audit({ user: ctx.user, orgId, actingAsPlatform: true }, {
    action: 'storage.update',
    resourceType: 'org_storage',
    resourceId: orgId,
    before: before ? { bucket: before.bucket, publicUrl: before.publicUrl, accountId: before.accountId, keyHint: before.keyHint } : null,
    after: { bucket: values.bucket, publicUrl: values.publicUrl, accountId: values.accountId, keyHint: values.keyHint ?? before?.keyHint, keysRotated: keysGiven, kiosksUpdated: bumped }
  });
  return { kiosksUpdated: bumped };
}

export async function testStorage(ctx: PlatformContext, orgId: string) {
  const r = await row(orgId);
  if (!r) throw new AppError('ยังไม่ได้ตั้งพื้นที่เก็บภาพ');
  const result = await testR2(credentialsOf(r));
  await db()
    .update(orgStorage)
    .set({ lastTestAt: new Date(), lastTestOk: result.ok, lastTestError: result.ok ? null : result.error.slice(0, 500) })
    .where(eq(orgStorage.orgId, orgId));
  await audit({ user: ctx.user, orgId, actingAsPlatform: true }, { action: 'storage.test', resourceType: 'org_storage', resourceId: orgId, after: result });
  return result;
}

/**
 * Plaintext secrets for one kiosk config response (sealed with the device token by the caller).
 * A kiosk that can ask for signed URLs (`presign`) gets the bucket details but no keys.
 */
export async function kioskSecretsFor(orgId: string, { presign = false } = {}): Promise<KioskSecrets | null> {
  const r = await row(orgId);
  if (!r) return null;
  const c = credentialsOf(r);
  const base = { accountId: c.accountId, endpoint: r2Endpoint(c), bucket: c.bucket, publicUrl: r.publicUrl };
  return {
    version: r.secretsVersion,
    r2: presign ? { ...base, presign: true } : { ...base, accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey }
  };
}

/** Signs short-lived URLs for objects in a shop's bucket (keys checked by the caller). */
export async function presignForOrg(orgId: string, items: { method: string; key: string }[], expiresSec: number) {
  const r = await row(orgId);
  if (!r) return null;
  const c = credentialsOf(r);
  const origin = r2Endpoint(c).replace(/\/+$/, '');
  return items.map((it) => ({
    method: it.method,
    key: it.key,
    url: presignUrl({ method: it.method, origin, path: `/${c.bucket}/${it.key}`, region: 'auto', accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey, expiresSec })
  }));
}

export async function hasStorage(orgId: string): Promise<boolean> {
  return !!(await row(orgId));
}
