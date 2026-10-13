import { NextResponse, type NextRequest } from 'next/server';
import { authenticateKiosk } from '@/server/kiosk-api/auth';
import { kioskRoute } from '@/server/kiosk-api/http';
import { closePhoneUpload, phoneUploadState } from '@/server/services/phone-uploads';

export const dynamic = 'force-dynamic';

const idOf = (req: NextRequest) => decodeURIComponent(req.nextUrl.pathname.split('/').pop() || '').slice(0, 32);

/** GET /kiosk/uploads/{id} — status; once ready the kiosk fetches /photos/{i}. */
export const GET = kioskRoute(async (req) => {
  const auth = await authenticateKiosk(req);
  return NextResponse.json(await phoneUploadState(auth, idOf(req)));
});

/** DELETE /kiosk/uploads/{id} — photos taken, or the customer went back: they are deleted. */
export const DELETE = kioskRoute(async (req) => {
  const auth = await authenticateKiosk(req);
  await closePhoneUpload(auth, idOf(req));
  return NextResponse.json({ ok: true });
});
