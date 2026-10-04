import 'server-only';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { eq } from 'drizzle-orm';
import type { AssetRef } from '@photobooth/contracts';
import { db } from '@/server/db/client';
import { catalogAssets } from '@/server/db/schema';
import { AppError } from '@/server/lib/errors';
import { r2Client, type R2Credentials } from '@/server/lib/r2';

/**
 * Files of the central template catalog. Content-addressed (`catalog/<sha256>.<ext>`), so a
 * file never changes once a kiosk has it. Stored in the company's own R2 bucket when
 * PLATFORM_R2_* is set; otherwise (local development) under `.local/catalog-assets`, served
 * by `/catalog-assets/<file>`.
 */

const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg' };
const LOCAL_DIR = join(process.cwd(), '..', '..', '.local', 'catalog-assets');

function platformR2(): (R2Credentials & { publicUrl: string }) | null {
  const e = process.env;
  if (!e.PLATFORM_R2_BUCKET || !e.PLATFORM_R2_ACCESS_KEY_ID || !e.PLATFORM_R2_SECRET_ACCESS_KEY || !e.PLATFORM_R2_PUBLIC_URL) return null;
  return {
    accountId: e.PLATFORM_R2_ACCOUNT_ID ?? '',
    endpoint: e.PLATFORM_R2_ENDPOINT ?? '',
    bucket: e.PLATFORM_R2_BUCKET,
    accessKeyId: e.PLATFORM_R2_ACCESS_KEY_ID,
    secretAccessKey: e.PLATFORM_R2_SECRET_ACCESS_KEY,
    publicUrl: e.PLATFORM_R2_PUBLIC_URL.replace(/\/+$/, '')
  };
}

export function assetStorageMode(): 'r2' | 'local' | 'none' {
  if (platformR2()) return 'r2';
  return process.env.VERCEL ? 'none' : 'local';
}

/** Stores bytes once (by hash) and returns the reference saved in template versions. */
export async function putAsset(bytes: Uint8Array, contentType: 'image/png' | 'image/jpeg', meta: { width?: number; height?: number; userId: string }): Promise<AssetRef> {
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const key = `catalog/${sha256}.${EXT[contentType]}`;
  const existing = (await db().select().from(catalogAssets).where(eq(catalogAssets.sha256, sha256)).limit(1))[0];
  if (!existing) {
    const r2 = platformR2();
    if (r2) {
      const client = r2Client(r2);
      try {
        // Immutable: kiosks and browsers may cache forever
        await client.send(new PutObjectCommand({ Bucket: r2.bucket, Key: key, Body: bytes, ContentType: contentType, CacheControl: 'public, max-age=31536000, immutable' }));
      } finally {
        client.destroy();
      }
    } else if (assetStorageMode() === 'local') {
      await mkdir(LOCAL_DIR, { recursive: true });
      await writeFile(join(LOCAL_DIR, key.slice('catalog/'.length)), bytes);
    } else {
      throw new AppError('ยังไม่ได้ตั้งพื้นที่เก็บไฟล์ส่วนกลาง (PLATFORM_R2_*) จึงอัปโหลดไม่ได้');
    }
    await db()
      .insert(catalogAssets)
      .values({ sha256, storageKey: key, contentType, bytes: bytes.byteLength, width: meta.width ?? null, height: meta.height ?? null, createdBy: meta.userId })
      .onDuplicateKeyUpdate({ set: { sha256 } });
  }
  return { url: key, sha256, width: meta.width, height: meta.height, bytes: bytes.byteLength };
}

/**
 * Absolute URL for a stored key. `origin` is the Admin's own origin (used for local files);
 * R2 files use the bucket's public URL.
 */
export function assetUrl(key: string, origin: string): string {
  if (/^https?:\/\//.test(key)) return key;
  const r2 = platformR2();
  if (r2) return `${r2.publicUrl}/${key}`;
  return `${origin.replace(/\/+$/, '')}/catalog-assets/${key.slice('catalog/'.length)}`;
}

/** Same-origin path for the Admin's own pages (works for local and R2). */
export function assetPath(key: string): string {
  const r2 = platformR2();
  if (r2) return `${r2.publicUrl}/${key}`;
  return `/catalog-assets/${key.slice('catalog/'.length)}`;
}

/** Local development only: the bytes behind /catalog-assets/<file>. */
export async function readLocalAsset(file: string): Promise<{ bytes: Buffer; contentType: string } | null> {
  if (!/^[0-9a-f]{64}\.(png|jpg)$/.test(file)) return null;
  try {
    const bytes = await readFile(join(LOCAL_DIR, file));
    return { bytes, contentType: file.endsWith('.png') ? 'image/png' : 'image/jpeg' };
  } catch {
    return null;
  }
}

/** Reads a stored asset's bytes (used when R2 is configured and the editor needs a file). */
export async function readAsset(key: string): Promise<Uint8Array | null> {
  const r2 = platformR2();
  if (!r2) return (await readLocalAsset(key.slice('catalog/'.length)))?.bytes ?? null;
  const client = r2Client(r2);
  try {
    const got = await client.send(new GetObjectCommand({ Bucket: r2.bucket, Key: key }));
    return got.Body ? await got.Body.transformToByteArray() : null;
  } finally {
    client.destroy();
  }
}
