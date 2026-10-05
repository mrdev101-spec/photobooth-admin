import { NextResponse } from 'next/server';
import { authenticateKiosk } from '@/server/kiosk-api/auth';
import { kioskRoute } from '@/server/kiosk-api/http';
import { waitForKiosk } from '@/server/kiosk-api/wait';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** GET /kiosk/wait?rev={revision}&manifest={manifestRevision} — long poll for anything new. */
export const GET = kioskRoute(async (req) => {
  const auth = await authenticateKiosk(req);
  const num = (k: string) => Math.max(0, Number(req.nextUrl.searchParams.get(k)) || 0);
  return NextResponse.json(await waitForKiosk(auth, { revision: num('rev'), manifest: num('manifest') }, req.signal));
});
