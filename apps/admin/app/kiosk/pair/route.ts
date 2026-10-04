import { NextResponse } from 'next/server';
import { PairRequestSchema } from '@photobooth/contracts';
import { clientIp, kioskRoute, readJson } from '@/server/kiosk-api/http';
import { pairKiosk } from '@/server/kiosk-api/pairing';

export const dynamic = 'force-dynamic';

/** POST /kiosk/pair — no token yet; the one-time pairing code is the credential. */
export const POST = kioskRoute(async (req) => {
  const input = PairRequestSchema.parse(await readJson(req));
  const result = await pairKiosk(input, clientIp(req));
  return NextResponse.json(result, { status: 201 });
});
