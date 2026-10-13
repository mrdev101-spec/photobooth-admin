import { NextResponse, type NextRequest } from 'next/server';
import { clientIp } from '@/server/kiosk-api/http';
import { rateLimit } from '@/server/lib/rate-limit';
import { MAX_PHOTO_BYTES, addPhoneFile } from '@/server/services/phone-uploads';

export const dynamic = 'force-dynamic';

/** POST /u/{token}/files?i=0 — one photo from the customer's phone (the body is the image). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!(await rateLimit(`phu:${clientIp(req)}`, 60, 600))) return NextResponse.json({ error: 'ส่งถี่เกินไป รอสักครู่แล้วลองใหม่' }, { status: 429 });
  if (Number(req.headers.get('content-length') ?? 0) > MAX_PHOTO_BYTES) return NextResponse.json({ error: 'รูปใหญ่เกินไป' }, { status: 413 });
  const bytes = new Uint8Array(await req.arrayBuffer());
  const mime = (req.headers.get('content-type') || '').split(';')[0]!.trim();
  try {
    const r = await addPhoneFile(token, Number(req.nextUrl.searchParams.get('i')), mime, bytes);
    return NextResponse.json(r, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    return NextResponse.json({ error: msg === 'expired' ? 'ลิงก์หมดอายุแล้ว สแกน QR ที่ตู้ใหม่อีกครั้ง' : 'ส่งรูปนี้ไม่ได้ (ต้องเป็นไฟล์รูปไม่เกิน 4 MB)' }, { status: msg === 'expired' ? 410 : 400 });
  }
}
