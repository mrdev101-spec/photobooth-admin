import 'server-only';
import { headers } from 'next/headers';

/** The Admin's public address (ADMIN_PUBLIC_URL, else this request's host) for links given to Stripe etc. */
export async function publicOrigin(): Promise<string> {
  if (process.env.ADMIN_PUBLIC_URL) return process.env.ADMIN_PUBLIC_URL.replace(/\/+$/, '');
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3100';
  const proto = h.get('x-forwarded-proto') ?? (/^(localhost|127\.)/.test(host) ? 'http' : 'https');
  return `${proto}://${host}`;
}
