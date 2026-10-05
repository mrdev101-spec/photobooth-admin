import { createHmac, timingSafeEqual } from 'node:crypto';

const WEBHOOK_TOLERANCE_S = 300;

/** Stripe-Signature: t=<ts>,v1=<hmac>[,v1=…]; HMAC-SHA256 over "<ts>.<raw body>". */
export function verifyStripeSignature(rawBody: string, header: string | null, secret: string, now = Date.now()): boolean {
  if (!header || !secret) return false;
  const parts: Record<string, string[]> = {};
  for (const p of header.split(',')) {
    const [k, v] = p.split('=');
    if (k && v) (parts[k] ??= []).push(v);
  }
  const ts = Number(parts.t?.[0]);
  if (!ts || Math.abs(now / 1000 - ts) > WEBHOOK_TOLERANCE_S) return false;
  const expected = Buffer.from(createHmac('sha256', secret).update(`${ts}.${rawBody}`, 'utf8').digest('hex'), 'hex');
  return (parts.v1 ?? []).some((sig) => {
    const got = Buffer.from(sig, 'hex');
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
}
