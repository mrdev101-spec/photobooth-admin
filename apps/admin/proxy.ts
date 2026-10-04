import { NextResponse, type NextRequest } from 'next/server';

/**
 * Optimistic check only: no session cookie → /login. The real session and permission
 * checks happen in layouts/pages/actions (server/auth/context.ts).
 * Kiosk API, webhooks and cron routes use their own auth and are not matched here.
 */
export function proxy(request: NextRequest) {
  if (!request.cookies.has('pb_session')) {
    const url = new URL('/login', request.url);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/select-org', '/change-password', '/platform/:path*', '/o/:path*', '/print/:path*']
};
