import { NextResponse } from 'next/server';
import { authenticateKiosk } from '@/server/kiosk-api/auth';
import { kioskRoute } from '@/server/kiosk-api/http';
import { unpairSelf } from '@/server/kiosk-api/pairing';

export const dynamic = 'force-dynamic';

/** POST /kiosk/unpair — Bearer deviceToken: the kiosk unpaired itself; its record is released. */
export const POST = kioskRoute(async (req) => {
  const auth = await authenticateKiosk(req);
  await unpairSelf(auth);
  return NextResponse.json({ ok: true });
});
