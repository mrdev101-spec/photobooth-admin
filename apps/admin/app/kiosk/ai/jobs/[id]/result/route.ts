import { NextResponse, type NextRequest } from 'next/server';
import { authenticateKiosk } from '@/server/kiosk-api/auth';
import { kioskRoute } from '@/server/kiosk-api/http';
import { handleAiJobResult } from '@/server/kiosk-api/ai';

export const dynamic = 'force-dynamic';

/** GET /kiosk/ai/jobs/{id}/result — the finished image (kept for an hour). */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return kioskRoute(async (r) => {
    const { mimeType, bytes } = await handleAiJobResult(await authenticateKiosk(r), id);
    return new NextResponse(new Uint8Array(bytes), { headers: { 'content-type': mimeType } });
  })(req);
}
