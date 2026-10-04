import { NextResponse } from 'next/server';
import { OrderInputSchema } from '@photobooth/contracts';
import { authenticateKiosk } from '@/server/kiosk-api/auth';
import { kioskRoute, readJson } from '@/server/kiosk-api/http';
import { createOrderFromKiosk } from '@/server/kiosk-api/orders';

export const dynamic = 'force-dynamic';

/** POST /orders — the kiosk reports a sale (201 new, 200 already received). */
export const POST = kioskRoute(async (req) => {
  const auth = await authenticateKiosk(req);
  const { order, created } = await createOrderFromKiosk(auth, OrderInputSchema.parse(await readJson(req)));
  return NextResponse.json(order, { status: created ? 201 : 200 });
});
