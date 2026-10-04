import { NextResponse } from 'next/server';
import { authenticateKiosk } from '@/server/kiosk-api/auth';
import { KioskApiError, kioskRoute } from '@/server/kiosk-api/http';
import { kioskConfig } from '@/server/kiosk-api/config';

export const dynamic = 'force-dynamic';

/** GET /kiosk/config?since={rev} — 304 when unchanged. */
export const GET = kioskRoute(async (req) => {
  const auth = await authenticateKiosk(req);
  const raw = req.nextUrl.searchParams.get('since');
  const since = raw == null || raw === '' ? null : Number(raw);
  if (since != null && (!Number.isInteger(since) || since < 0)) throw new KioskApiError('AD0003', 400, 'since ไม่ถูกต้อง');
  const config = await kioskConfig(auth, since);
  if (!config) return new NextResponse(null, { status: 304 });
  return NextResponse.json(config);
});
