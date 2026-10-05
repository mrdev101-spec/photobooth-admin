import { NextResponse, after } from 'next/server';
import { AiJobRequestSchema } from '@photobooth/contracts';
import { authenticateKiosk } from '@/server/kiosk-api/auth';
import { kioskRoute, readJson } from '@/server/kiosk-api/http';
import { handleAiJobCreate, runJobInBackground } from '@/server/kiosk-api/ai';

export const dynamic = 'force-dynamic';
// Two provider passes (portrait + face refinement) can take a few minutes in the background
export const maxDuration = 300;

const MAX_AI_BODY_BYTES = 12_000_000;

/** POST /kiosk/ai/jobs — queue one customer image; the kiosk polls GET /kiosk/ai/jobs/{id}. */
export const POST = kioskRoute(async (req) => {
  const auth = await authenticateKiosk(req);
  const body = AiJobRequestSchema.parse(await readJson(req, MAX_AI_BODY_BYTES));
  const { job, run } = await handleAiJobCreate(auth, body);
  if (run) after(() => runJobInBackground(run));
  return NextResponse.json(job, { status: 202 });
});
