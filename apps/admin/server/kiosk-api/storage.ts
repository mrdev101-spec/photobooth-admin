import 'server-only';
import type { StorageSignRequestSchema, StorageSignResponse } from '@photobooth/contracts';
import type { z } from 'zod';
import { presignForOrg } from '@/server/services/storage';
import { assertKioskServing, type KioskAuth } from './auth';
import { KioskApiError } from './http';

const EXPIRES_SEC = 600;

/**
 * Signed URLs for one kiosk's own objects in the shop's bucket: everything under p/<Kiosk ID>/
 * (photos, originals, pickup orders) and the shared download page (view-<hash>.html, write
 * once). Nothing else: no listing, no other kiosk's files, no bucket settings.
 */
export async function signKioskStorage(auth: KioskAuth, body: z.output<typeof StorageSignRequestSchema>): Promise<StorageSignResponse> {
  assertKioskServing(auth);
  const own = `p/${auth.kiosk.kioskId}/`;
  for (const r of body.requests) {
    const inFolder = r.key.startsWith(own) && !r.key.includes('..') && /^[A-Za-z0-9/._-]+$/.test(r.key);
    const viewerPage = /^view-[0-9a-f]{10}\.html$/.test(r.key) && (r.method === 'PUT' || r.method === 'HEAD');
    if (!inFolder && !viewerPage) throw new KioskApiError('AD0003', 403, `ตู้นี้เข้าถึงไฟล์ ${r.key.slice(0, 80)} ไม่ได้`);
  }
  const urls = await presignForOrg(auth.org.id, body.requests, EXPIRES_SEC);
  if (!urls) throw new KioskApiError('AD0005', 409, 'บัญชีนี้ยังไม่มีพื้นที่เก็บภาพ');
  return { urls, expiresAt: new Date(Date.now() + EXPIRES_SEC * 1000).toISOString() };
}
