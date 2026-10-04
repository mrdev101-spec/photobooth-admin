import { NextResponse } from 'next/server';
import { authenticateKiosk } from '@/server/kiosk-api/auth';
import { KioskApiError, kioskRoute } from '@/server/kiosk-api/http';
import { assetManifest } from '@/server/kiosk-api/assets';

export const dynamic = 'force-dynamic';

/** GET /kiosk/assets/manifest?since={rev} — uploaded templates and their files; 304 when unchanged. */
export const GET = kioskRoute(async (req) => {
  const auth = await authenticateKiosk(req);
  const raw = req.nextUrl.searchParams.get('since');
  const since = raw == null || raw === '' ? null : Number(raw);
  if (since != null && (!Number.isInteger(since) || since < 0)) throw new KioskApiError('AD0003', 400, 'since ไม่ถูกต้อง');
  const manifest = await assetManifest(auth, since, process.env.ADMIN_PUBLIC_URL || req.nextUrl.origin);
  if (!manifest) return new NextResponse(null, { status: 304 });
  return NextResponse.json(manifest);
});
