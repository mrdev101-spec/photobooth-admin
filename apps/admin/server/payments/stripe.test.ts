import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyStripeSignature } from './signature';

const SECRET = 'whsec_unit_test_secret';
const sign = (body: string, ts: number, secret = SECRET) => `t=${ts},v1=${createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex')}`;

describe('Stripe webhook signature', () => {
  const body = JSON.stringify({ id: 'evt_1', type: 'payment_intent.succeeded' });
  const now = Date.parse('2026-10-05T08:00:00Z');
  const ts = now / 1000;

  it('accepts a signature made with the endpoint secret', () => {
    expect(verifyStripeSignature(body, sign(body, ts), SECRET, now)).toBe(true);
  });
  it('accepts when one of several v1 signatures matches (secret rotation)', () => {
    const header = `${sign(body, ts, 'whsec_old')},v1=${sign(body, ts).split('v1=')[1]}`;
    expect(verifyStripeSignature(body, header, SECRET, now)).toBe(true);
  });
  it('rejects another secret, a changed body, an old timestamp or no header', () => {
    expect(verifyStripeSignature(body, sign(body, ts, 'whsec_other'), SECRET, now)).toBe(false);
    expect(verifyStripeSignature(`${body} `, sign(body, ts), SECRET, now)).toBe(false);
    expect(verifyStripeSignature(body, sign(body, ts - 301), SECRET, now)).toBe(false);
    expect(verifyStripeSignature(body, null, SECRET, now)).toBe(false);
  });
});
