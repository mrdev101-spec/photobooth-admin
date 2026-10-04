import type { NextRequest } from 'next/server';
import { assetStorageMode, readLocalAsset } from '@/server/services/asset-store';

/**
 * Local development: serves central template files (in production they come from the
 * company's R2 bucket). Public on purpose — kiosks download these without a session — and
 * content-addressed, so they can be cached forever.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ file: string }> }) {
  if (assetStorageMode() !== 'local') return new Response('Not found', { status: 404 });
  const { file } = await params;
  const asset = await readLocalAsset(file);
  if (!asset) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(asset.bytes), {
    headers: { 'Content-Type': asset.contentType, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' }
  });
}
