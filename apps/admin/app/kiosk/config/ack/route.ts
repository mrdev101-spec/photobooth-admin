import { NextResponse } from 'next/server';
import { ConfigAckSchema } from '@photobooth/contracts';
import { authenticateKiosk } from '@/server/kiosk-api/auth';
import { kioskRoute, readJson } from '@/server/kiosk-api/http';
import { ackConfig } from '@/server/kiosk-api/config';

export const dynamic = 'force-dynamic';

/** POST /kiosk/config/ack — the kiosk applied (or rejected) a revision. */
export const POST = kioskRoute(async (req) => {
  const auth = await authenticateKiosk(req);
  await ackConfig(auth, ConfigAckSchema.parse(await readJson(req)));
  return new NextResponse(null, { status: 204 });
});
