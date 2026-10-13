import { NextResponse, type NextRequest } from 'next/server';
import { authenticateKiosk } from '@/server/kiosk-api/auth';
import { kioskRoute } from '@/server/kiosk-api/http';
import { phoneUploadPhoto } from '@/server/services/phone-uploads';

export const dynamic = 'force-dynamic';

/** GET /kiosk/uploads/{id}/photos/{i} — one photo of a ready session (image bytes). */
export const GET = kioskRoute(async (req: NextRequest) => {
  const auth = await authenticateKiosk(req);
  const parts = req.nextUrl.pathname.split('/');
  const idx = Number(parts.pop());
  parts.pop(); // "photos"
  const id = decodeURIComponent(parts.pop() || '').slice(0, 32);
  const f = await phoneUploadPhoto(auth, id, Number.isInteger(idx) ? idx : -1);
  return new NextResponse(new Uint8Array(f.bytes), { headers: { 'content-type': f.mimeType } });
});
