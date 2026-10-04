import { NextResponse } from 'next/server';
import { HeartbeatRequestSchema } from '@photobooth/contracts';
import { authenticateKiosk } from '@/server/kiosk-api/auth';
import { clientIp, kioskRoute, readJson } from '@/server/kiosk-api/http';
import { recordHeartbeat } from '@/server/kiosk-api/heartbeat';

export const dynamic = 'force-dynamic';

/** POST /kiosk/heartbeat — Bearer deviceToken. */
export const POST = kioskRoute(async (req) => {
  const auth = await authenticateKiosk(req);
  const data = HeartbeatRequestSchema.parse(await readJson(req));
  return NextResponse.json(await recordHeartbeat(auth, data, clientIp(req)));
});
