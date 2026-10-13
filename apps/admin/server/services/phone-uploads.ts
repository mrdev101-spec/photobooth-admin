import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, inArray, lt, or, sql } from 'drizzle-orm';
import type { PhoneUploadSession, PhoneUploadState } from '@photobooth/contracts';
import { db } from '@/server/db/client';
import { phoneUploadFiles, phoneUploads } from '@/server/db/schema';
import { newId } from '@/server/lib/ids';
import { currentSettings } from '@/server/services/kiosk-config';
import { KioskApiError } from '@/server/kiosk-api/http';
import type { KioskAuth } from '@/server/kiosk-api/auth';

/**
 * Photos from the customer's phone (QR on the kiosk → /u/{token} on the phone). The photos
 * wait here only until the kiosk takes them, and a session lasts SESSION_MS.
 */

const SESSION_MS = 10 * 60_000;
export const MAX_PHOTO_BYTES = 4 * 1024 * 1024; // the phone sends a resized JPEG (~1-2 MB)
const MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const expired = (row: { expiresAt: Date }) => row.expiresAt.getTime() < Date.now();

/** Old sessions and their photos go (called on every use). */
/** Drops expired / finished sessions' photos (also run by the housekeeping cron). */
export async function sweepPhoneUploads() {
  const old = await db()
    .select({ id: phoneUploads.id })
    .from(phoneUploads)
    .where(or(lt(phoneUploads.expiresAt, new Date()), inArray(phoneUploads.status, ['taken', 'cancelled'])))
    .limit(200);
  if (!old.length) return;
  const ids = old.map((r) => r.id);
  await db().delete(phoneUploadFiles).where(inArray(phoneUploadFiles.uploadId, ids));
  // Rows stay a day for the record (no photos), then go
  await db().delete(phoneUploads).where(and(inArray(phoneUploads.id, ids), lt(phoneUploads.createdAt, new Date(Date.now() - 86_400_000))));
}

/** Kiosk: a new session for `count` photos. Only when the shop switched the feature on. */
export async function createPhoneUpload(auth: KioskAuth, count: number, origin: string): Promise<PhoneUploadSession> {
  await sweepPhoneUploads();
  const cur = await currentSettings(auth.kiosk);
  if (!cur?.settings.phoneUpload?.enabled) throw new KioskApiError('AD0005', 403, 'ร้านยังไม่ได้เปิดให้ส่งรูปจากมือถือ');
  // A kiosk never needs many at once: earlier open sessions of this kiosk are closed
  await db().update(phoneUploads).set({ status: 'cancelled' }).where(and(eq(phoneUploads.kioskRowId, auth.kiosk.id), inArray(phoneUploads.status, ['waiting', 'uploading'])));
  const token = randomBytes(24).toString('base64url');
  const id = newId('phu');
  const expiresAt = new Date(Date.now() + SESSION_MS);
  await db().insert(phoneUploads).values({ id, orgId: auth.org.id, kioskRowId: auth.kiosk.id, tokenHash: hashToken(token), count, expiresAt });
  const base = (process.env.ADMIN_PUBLIC_URL || origin).replace(/\/+$/, '');
  return { id, url: `${base}/u/${token}`, count, expiresAt: expiresAt.toISOString() };
}

async function kioskRow(auth: KioskAuth, id: string) {
  const row = (await db().select().from(phoneUploads).where(and(eq(phoneUploads.id, id), eq(phoneUploads.kioskRowId, auth.kiosk.id))).limit(1))[0];
  if (!row) throw new KioskApiError('AD0003', 404, 'ไม่พบรอบอัปโหลดนี้');
  return row;
}

/** Kiosk: how the session is going (the photos are fetched one by one once ready). */
export async function phoneUploadState(auth: KioskAuth, id: string): Promise<PhoneUploadState> {
  const row = await kioskRow(auth, id);
  const base = { received: row.received, count: row.count };
  if ((row.status === 'waiting' || row.status === 'uploading') && expired(row)) return { status: 'expired', ...base };
  return { status: row.status, ...base };
}

/** Kiosk: one photo of a ready session. */
export async function phoneUploadPhoto(auth: KioskAuth, id: string, idx: number) {
  const row = await kioskRow(auth, id);
  if (row.status !== 'ready') throw new KioskApiError('AD0003', 409, 'รูปยังส่งมาไม่ครบ');
  const f = (await db().select().from(phoneUploadFiles).where(and(eq(phoneUploadFiles.uploadId, id), eq(phoneUploadFiles.idx, idx))).limit(1))[0];
  if (!f) throw new KioskApiError('AD0003', 404, 'ไม่พบรูปนี้');
  return { mimeType: f.mimeType, bytes: Buffer.from(f.bytes) };
}

/** Kiosk: done with the session (taken, or the customer went back): its photos are deleted. */
export async function closePhoneUpload(auth: KioskAuth, id: string) {
  const row = await kioskRow(auth, id);
  if (row.status !== 'taken' && row.status !== 'cancelled') await db().update(phoneUploads).set({ status: row.status === 'ready' ? 'taken' : 'cancelled' }).where(eq(phoneUploads.id, id));
  await db().delete(phoneUploadFiles).where(eq(phoneUploadFiles.uploadId, id));
}

// ─── The phone (public, by token) ───────────────────────────────────────────

export type PublicUpload = { id: string; count: number; received: number; status: string; expiresAt: Date };

/** The open session of a token, or null (unknown, finished or expired). */
export async function uploadByToken(token: string): Promise<PublicUpload | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const row = (await db().select().from(phoneUploads).where(eq(phoneUploads.tokenHash, hashToken(token))).limit(1))[0];
  if (!row || expired(row) || (row.status !== 'waiting' && row.status !== 'uploading')) return null;
  return { id: row.id, count: row.count, received: row.received, status: row.status, expiresAt: row.expiresAt };
}

/** One photo (index `idx`) from the phone; sending the same index again replaces it. */
export async function addPhoneFile(token: string, idx: number, mimeType: string, bytes: Uint8Array) {
  const up = await uploadByToken(token);
  if (!up) throw new Error('expired');
  if (!Number.isInteger(idx) || idx < 0 || idx >= up.count) throw new Error('bad index');
  if (!MIME.has(mimeType) || !bytes.length || bytes.length > MAX_PHOTO_BYTES) throw new Error('bad file');
  await db().insert(phoneUploadFiles).values({ uploadId: up.id, idx, mimeType, bytes: Buffer.from(bytes) }).onDuplicateKeyUpdate({ set: { mimeType, bytes: Buffer.from(bytes) } });
  const n = (await db().select({ n: sql<number>`count(*)` }).from(phoneUploadFiles).where(eq(phoneUploadFiles.uploadId, up.id)))[0]?.n ?? 0;
  await db().update(phoneUploads).set({ received: Number(n), status: 'uploading' }).where(eq(phoneUploads.id, up.id));
  return { received: Number(n), count: up.count };
}

/** Every photo is in: the kiosk takes them on its next look. */
export async function finishPhoneUpload(token: string) {
  const up = await uploadByToken(token);
  if (!up) throw new Error('expired');
  if (up.received < up.count) throw new Error('missing');
  await db().update(phoneUploads).set({ status: 'ready' }).where(eq(phoneUploads.id, up.id));
}
