import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { runHousekeeping } from '@/server/services/housekeeping';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /internal/cron/housekeeping — Vercel Cron (vercel.json) or any scheduler sends
 * `Authorization: Bearer <CRON_SECRET>`. Without CRON_SECRET the route is off.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET is not set' }, { status: 503 });
  const given = Buffer.from(req.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ ok: true, at: new Date().toISOString(), result: await runHousekeeping() });
}
