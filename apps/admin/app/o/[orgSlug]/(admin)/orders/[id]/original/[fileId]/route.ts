import type { NextRequest } from 'next/server';
import { getOrgContext } from '@/server/auth/context';
import { getOrder, originalsUntil, storagePublicUrl } from '@/server/services/orders';

export const dynamic = 'force-dynamic';

const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg' };
const text = (status: number, body: string) => new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });

/**
 * The full-quality original of one order file, from the shop's R2 (pages show the small thumbnail).
 * ?view=1 opens it in the browser, otherwise it downloads. Same access as the order page.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ orgSlug: string; id: string; fileId: string }> }) {
  const { orgSlug, id, fileId } = await params;
  const ctx = await getOrgContext(orgSlug).catch(() => null);
  if (!ctx) return text(404, 'ไม่พบไฟล์');
  const order = await getOrder(ctx, id).catch(() => null);
  const file = order?.files.find((f) => f.id === fileId);
  if (!order || !file) return text(404, 'ไม่พบไฟล์');
  const until = await originalsUntil(order);
  if (until && until.getTime() < Date.now()) return text(410, 'ต้นฉบับหมดอายุแล้ว (ลบตาม "ลบภาพหลัง" ของร้าน)');
  const base = await storagePublicUrl(ctx.org.id);
  if (!base || !file.url.startsWith(`${base}/`)) return text(404, 'ไม่พบต้นฉบับในพื้นที่เก็บภาพของร้าน');

  const res = await fetch(file.url, { cache: 'no-store', signal: AbortSignal.timeout(30_000) }).catch(() => null);
  if (!res || !res.ok || !res.body) return text(res?.status === 404 ? 410 : 502, res?.status === 404 ? 'ต้นฉบับถูกลบจากพื้นที่เก็บภาพแล้ว' : 'ดึงต้นฉบับจาก R2 ไม่ได้ ลองใหม่อีกครั้ง');
  const type = res.headers.get('content-type')?.split(';')[0] || 'image/jpeg';
  const name = `${order.code ?? order.clientOrderId}-${file.kind}.${EXT[type] ?? 'jpg'}`;
  const view = req.nextUrl.searchParams.get('view') === '1';
  return new Response(res.body, {
    headers: {
      'Content-Type': EXT[type] ? type : 'application/octet-stream',
      ...(res.headers.get('content-length') ? { 'Content-Length': res.headers.get('content-length')! } : {}),
      'Content-Disposition': `${view ? 'inline' : 'attachment'}; filename="${name}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}
