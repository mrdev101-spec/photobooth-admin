import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { describeError } from '@photobooth/error-codes';
import type { ApiError } from '@photobooth/contracts';

/**
 * Error envelope for the kiosk: `{ code, message, retryable }` with codes from the shared
 * catalogue (packages/error-codes) so the kiosk can explain them in its System Log.
 */
export class KioskApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message?: string,
    readonly details?: unknown
  ) {
    super(message ?? describeError(code)?.title ?? code);
  }
}

export const MAX_BODY_BYTES = 1_000_000;

function errorBody(code: string, message: string, details?: unknown): ApiError {
  return { code, message, retryable: describeError(code)?.retryable ?? false, ...(details ? { details } : {}) };
}

export function clientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
}

/** Reads a JSON body with a size cap; bad JSON is AD0003. */
export async function readJson(req: NextRequest, maxBytes = MAX_BODY_BYTES): Promise<unknown> {
  const declared = Number(req.headers.get('content-length') ?? 0);
  if (declared > maxBytes) throw new KioskApiError('AD0003', 413, 'ข้อมูลใหญ่เกินไป');
  const text = await req.text();
  if (text.length > maxBytes) throw new KioskApiError('AD0003', 413, 'ข้อมูลใหญ่เกินไป');
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new KioskApiError('AD0003', 400, 'JSON ไม่ถูกต้อง');
  }
}

/** Wraps a Kiosk API route: maps known errors to the envelope, hides everything else. */
export function kioskRoute(handler: (req: NextRequest) => Promise<NextResponse>) {
  return async (req: NextRequest): Promise<NextResponse> => {
    try {
      const res = await handler(req);
      res.headers.set('cache-control', 'no-store');
      return res;
    } catch (err) {
      if (err instanceof KioskApiError) {
        return NextResponse.json(errorBody(err.code, err.message, err.details), { status: err.status, headers: { 'cache-control': 'no-store' } });
      }
      if (err instanceof z.ZodError) {
        const details = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
        return NextResponse.json(errorBody('AD0003', 'ข้อมูลไม่ถูกต้อง', details), { status: 422 });
      }
      console.error('[kiosk-api]', err);
      return NextResponse.json(errorBody('AD0000', 'ระบบ Web Admin ขัดข้อง'), { status: 500 });
    }
  };
}
