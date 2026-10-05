import { NextResponse, type NextRequest } from 'next/server';
import { CommandResultSchema } from '@photobooth/contracts';
import { authenticateKiosk } from '@/server/kiosk-api/auth';
import { kioskRoute, readJson } from '@/server/kiosk-api/http';
import { commandResult } from '@/server/kiosk-api/wait';

export const dynamic = 'force-dynamic';

/** POST /kiosk/commands/{id}/result — the kiosk did (or could not do) a command. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return kioskRoute(async (r) => {
    const auth = await authenticateKiosk(r);
    await commandResult(auth, id, CommandResultSchema.parse(await readJson(r)));
    return new NextResponse(null, { status: 204 });
  })(req);
}
