import { NextResponse } from 'next/server';
import { authenticateKiosk } from '@/server/kiosk-api/auth';
import { kioskRoute } from '@/server/kiosk-api/http';
import { handleAiStatus } from '@/server/kiosk-api/ai';

export const dynamic = 'force-dynamic';

/** GET /kiosk/ai/status — whether this kiosk can take AI customers now (asked before payment). */
export const GET = kioskRoute(async (req) => NextResponse.json(await handleAiStatus(await authenticateKiosk(req))));
