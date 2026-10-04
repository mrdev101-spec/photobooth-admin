import { NextResponse, type NextRequest } from 'next/server';
import { OrderPrintedSchema } from '@photobooth/contracts';
import { authenticateKiosk } from '@/server/kiosk-api/auth';
import { kioskRoute, readJson } from '@/server/kiosk-api/http';
import { markPrintedAtKiosk } from '@/server/kiosk-api/orders';

export const dynamic = 'force-dynamic';

/** POST /orders/{ref}/printed — ref = orderId or pickup code. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  return kioskRoute(async (r) => {
    const auth = await authenticateKiosk(r);
    return NextResponse.json(await markPrintedAtKiosk(auth, ref.slice(0, 40), OrderPrintedSchema.parse(await readJson(r))));
  })(req);
}
