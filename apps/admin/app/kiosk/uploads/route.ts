import { NextResponse } from 'next/server';
import { PhoneUploadRequestSchema } from '@photobooth/contracts';
import { assertKioskServing, authenticateKiosk } from '@/server/kiosk-api/auth';
import { kioskRoute, readJson } from '@/server/kiosk-api/http';
import { createPhoneUpload } from '@/server/services/phone-uploads';

export const dynamic = 'force-dynamic';

/** POST /kiosk/uploads — a QR session for photos from the customer's phone. */
export const POST = kioskRoute(async (req) => {
  const auth = await authenticateKiosk(req);
  assertKioskServing(auth);
  const { count } = PhoneUploadRequestSchema.parse(await readJson(req));
  return NextResponse.json(await createPhoneUpload(auth, count, req.nextUrl.origin), { status: 201 });
});
