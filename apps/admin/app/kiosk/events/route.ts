import { NextResponse } from 'next/server';
import { KioskEventsRequestSchema } from '@photobooth/contracts';
import { authenticateKiosk } from '@/server/kiosk-api/auth';
import { kioskRoute, readJson } from '@/server/kiosk-api/http';
import { handleKioskEvents } from '@/server/kiosk-api/events';

export const dynamic = 'force-dynamic';

/** POST /kiosk/events — orders, print jobs and files from the kiosk's outbox (Event Console). */
export const POST = kioskRoute(async (req) => {
  const auth = await authenticateKiosk(req);
  const { events } = KioskEventsRequestSchema.parse(await readJson(req));
  return NextResponse.json({ results: await handleKioskEvents(auth, events) });
});
