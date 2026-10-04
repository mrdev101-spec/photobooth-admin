import { NextResponse } from 'next/server';
import { ConfigImportSchema } from '@photobooth/contracts';
import { authenticateKiosk } from '@/server/kiosk-api/auth';
import { kioskRoute, readJson } from '@/server/kiosk-api/http';
import { importConfig } from '@/server/kiosk-api/config';

export const dynamic = 'force-dynamic';

/** POST /kiosk/config/import — the kiosk's settings from before pairing (once, right after pairing). */
export const POST = kioskRoute(async (req) => {
  const auth = await authenticateKiosk(req);
  const { settings } = ConfigImportSchema.parse(await readJson(req));
  return NextResponse.json(await importConfig(auth, settings), { status: 201 });
});
