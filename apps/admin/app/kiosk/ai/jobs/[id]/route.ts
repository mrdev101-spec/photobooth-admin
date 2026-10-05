import { NextResponse, type NextRequest } from 'next/server';
import { authenticateKiosk } from '@/server/kiosk-api/auth';
import { kioskRoute } from '@/server/kiosk-api/http';
import { handleAiJobStatus } from '@/server/kiosk-api/ai';

export const dynamic = 'force-dynamic';

/** GET /kiosk/ai/jobs/{id} — job status (the kiosk polls every 2 s). */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return kioskRoute(async (r) => NextResponse.json(await handleAiJobStatus(await authenticateKiosk(r), id)))(req);
}
