import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/server/db/client';

export const dynamic = 'force-dynamic';

/** GET /healthz — uptime checks: the app answers and the database is reachable. */
export async function GET() {
  try {
    await db().execute(sql`SELECT 1`);
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ ok: false, error: 'database unreachable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
