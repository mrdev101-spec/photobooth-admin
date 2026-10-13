import { NextResponse, type NextRequest } from 'next/server';
import { finishPhoneUpload } from '@/server/services/phone-uploads';

export const dynamic = 'force-dynamic';

/** POST /u/{token}/done — every photo is in; the kiosk takes them. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    await finishPhoneUpload(token);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    return NextResponse.json({ error: msg === 'missing' ? 'ยังส่งรูปไม่ครบ' : 'ลิงก์หมดอายุแล้ว สแกน QR ที่ตู้ใหม่อีกครั้ง' }, { status: msg === 'missing' ? 400 : 410 });
  }
}
