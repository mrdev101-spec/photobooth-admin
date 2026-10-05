import 'server-only';

export { verifyStripeSignature } from './signature';

/*
 * Stripe REST calls for PromptPay (ported from the kiosk's stripePayment.cjs). Errors carry the
 * kiosk's PM codes so its customer screen and System Log read the same as before.
 * `stripeAccount` = a Stripe Connect account the call acts on (direct charges).
 */

const STRIPE_API = process.env.STRIPE_API_BASE_URL || 'https://api.stripe.com/v1';
const REQUEST_TIMEOUT_MS = 20_000;

export class StripeError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string
  ) {
    super(message);
  }
}

type Params = Record<string, unknown>;

function form(params: Params, prefix = '', out: string[] = []): string {
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((item) => out.push(`${encodeURIComponent(`${key}[]`)}=${encodeURIComponent(String(item))}`));
    else if (typeof v === 'object') form(v as Params, key, out);
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return out.join('&');
}

export interface StripeCall {
  secret: string;
  stripeAccount?: string | null;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- Stripe objects are read field by field */
export async function stripeRequest(call: StripeCall, method: 'GET' | 'POST', route: string, params?: Params, idempotencyKey?: string): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${STRIPE_API}${route}`, {
      method,
      headers: {
        Authorization: `Bearer ${call.secret}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(call.stripeAccount ? { 'Stripe-Account': call.stripeAccount } : {}),
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {})
      },
      body: params && method === 'POST' ? form(params) : undefined,
      signal: controller.signal
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = String(json?.error?.message ?? `Stripe HTTP ${res.status}`);
      if (res.status === 401) throw new StripeError(`Stripe Secret Key ไม่ถูกต้อง: ${msg}`, 401, 'PM0002');
      if (/promptpay/i.test(msg) && /(not|activated|enabled|supported)/i.test(msg)) throw new StripeError(`บัญชี Stripe ยังใช้ PromptPay ไม่ได้: ${msg}`, 400, 'PM0003');
      throw new StripeError(msg, res.status >= 500 ? 502 : 400, res.status >= 500 ? 'PM0005' : 'PM0004');
    }
    return json;
  } catch (e) {
    if (e instanceof StripeError) throw e;
    if (e instanceof Error && e.name === 'AbortError') throw new StripeError('Stripe ตอบกลับช้าเกินกำหนด', 504, 'PM0005');
    throw new StripeError(`เชื่อมต่อ Stripe ไม่ได้: ${e instanceof Error ? e.message : e}`, 503, 'PM0005');
  } finally {
    clearTimeout(timer);
  }
}

/** The account behind a key (connection test): name, country and whether it can take payments. */
export async function stripeAccountInfo(call: StripeCall) {
  const a = await stripeRequest(call, 'GET', call.stripeAccount ? `/accounts/${call.stripeAccount}` : '/account');
  return {
    id: String(a.id),
    name: String(a.settings?.dashboard?.display_name || a.business_profile?.name || a.id),
    country: String(a.country ?? ''),
    chargesEnabled: !!a.charges_enabled,
    livemode: call.secret.startsWith('sk_live_') || call.secret.startsWith('rk_live_')
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
