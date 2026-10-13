import { NextResponse } from 'next/server';
import { StorageSignRequestSchema } from '@photobooth/contracts';
import { authenticateKiosk } from '@/server/kiosk-api/auth';
import { kioskRoute, readJson } from '@/server/kiosk-api/http';
import { signKioskStorage } from '@/server/kiosk-api/storage';

export const dynamic = 'force-dynamic';

/** POST /kiosk/storage/sign — Bearer deviceToken; short-lived R2 URLs for this kiosk's files. */
export const POST = kioskRoute(async (req) => {
  const auth = await authenticateKiosk(req);
  const body = StorageSignRequestSchema.parse(await readJson(req));
  return NextResponse.json(await signKioskStorage(auth, body));
});
