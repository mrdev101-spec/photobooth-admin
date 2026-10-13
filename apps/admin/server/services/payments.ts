import 'server-only';
import { and, desc, eq, gte, inArray, isNull, lt, sql } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { organizations, payments, type Payment } from '@/server/db/schema';
import { newId } from '@/server/lib/ids';
import { currentSettings, shownSettings } from '@/server/services/kiosk-config';
import { accountFor, callForPayment, markWebhook, webhookSecrets, type PayMode } from '@/server/services/payment-accounts';
import { StripeError, stripeRequest, verifyStripeSignature, type StripeCall } from '@/server/payments/stripe';
import type { KioskAuth } from '@/server/kiosk-api/auth';
import { assertCan, type OrgContext } from '@/server/auth/context';
import { audit } from '@/server/audit';
import { AppError, notFound } from '@/server/lib/errors';

/**
 * PromptPay payments from kiosks (docs §8.4). The Admin chooses the Stripe account (company or
 * the shop's own), keeps the record per customer and learns the result from Stripe's webhook,
 * or by asking Stripe when the kiosk polls (fallback). An unpaid QR is canceled after it expires.
 */

const MIN_AMOUNT_THB = 10;
const MAX_AMOUNT_THB = 10_000;
const FINAL = new Set<Payment['status']>(['succeeded', 'canceled', 'failed', 'refunded']);

export class PaymentFlowError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

export interface NewPayment {
  amount: number;
  product: string;
  description: string;
}

export interface CreatedPayment {
  id: string;
  amount: number;
  qrData: string;
  qrImageUrl: string | null;
  testPageUrl: string | null;
  livemode: boolean;
  account: 'platform' | 'shop';
  expiresAt: number;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- Stripe objects */
function statusOf(intent: any): Payment['status'] {
  const s = String(intent?.status ?? '');
  if (s === 'succeeded' || s === 'canceled' || s === 'processing') return s;
  if (s.startsWith('requires_')) return 'requires_action';
  return 'failed';
}

/** What a kiosk may charge now (the settings its screen shows), or why not. */
async function payRules(auth: KioskAuth) {
  const cur = await shownSettings(auth.kiosk);
  if (!cur) throw new PaymentFlowError('PM0001', 409, 'ตู้นี้ยังไม่มีการตั้งค่าจาก Admin');
  const p = cur.settings.payment;
  if (!p.enabled) throw new PaymentFlowError('PM0001', 409, 'ตู้นี้ไม่ได้เปิดรับเงินผ่าน PromptPay');
  if (p.mode === 'live' && !auth.org.livePaymentsAllowed) throw new PaymentFlowError('AD0005', 403, 'บัญชีนี้ยังไม่ได้รับอนุญาตให้รับเงินจริง');
  return { mode: p.mode as PayMode, qrTimeoutSec: p.qrTimeoutSec, email: p.email, settings: cur.settings };
}

/** For the kiosk's payment screen: can it show a real QR now, and from which account. */
export async function kioskPaymentStatus(auth: KioskAuth) {
  const cur = await shownSettings(auth.kiosk);
  const p = cur?.settings.payment;
  if (!p?.enabled) return { enabled: false, ready: false, mode: p?.mode ?? 'test', account: null, reason: 'disabled' as const };
  if (p.mode === 'live' && !auth.org.livePaymentsAllowed) return { enabled: true, ready: false, mode: p.mode, account: null, reason: 'live_not_allowed' as const };
  const acct = await accountFor(auth.org, p.mode);
  if (!acct) return { enabled: true, ready: false, mode: p.mode, account: null, reason: 'no_account' as const };
  if (!acct.email && !p.email) return { enabled: true, ready: false, mode: p.mode, account: acct.account, reason: 'no_email' as const };
  return { enabled: true, ready: true, mode: p.mode, account: acct.account, reason: null };
}

export async function createKioskPayment(auth: KioskAuth, input: NewPayment): Promise<CreatedPayment> {
  const rules = await payRules(auth);
  const thb = Math.round(input.amount);
  if (!Number.isFinite(thb) || thb < MIN_AMOUNT_THB || thb > MAX_AMOUNT_THB) throw new PaymentFlowError('PM0004', 400, `จำนวนเงินไม่ถูกต้อง (${input.amount})`);
  // AI images are paid per image at the price the shop set: the one on the kiosk's screen, or the
  // newest one when the kiosk has just applied it
  if (/^ai:/.test(input.product)) {
    const latest = (await currentSettings(auth.kiosk))?.settings.products.ai.price;
    if (thb !== rules.settings.products.ai.price && thb !== latest) {
      throw new PaymentFlowError('AD0006', 400, `ราคา AI ไม่ตรงกับการตั้งค่า (฿${thb} ≠ ฿${rules.settings.products.ai.price})`);
    }
  }
  const acct = await accountFor(auth.org, rules.mode);
  if (!acct) throw new PaymentFlowError('PM0001', 503, `ยังไม่ได้ตั้งค่าบัญชี Stripe โหมด${rules.mode === 'live' ? 'จริง' : 'ทดสอบ'}`);
  const email = acct.email || rules.email;
  if (!email) throw new PaymentFlowError('PM0001', 503, 'ยังไม่ได้ตั้งอีเมลสำหรับ PromptPay');

  const id = newId('pay');
  const intent = await stripeRequest(
    acct.call,
    'POST',
    '/payment_intents',
    {
      amount: thb * 100, // satang
      currency: 'thb',
      payment_method_types: ['promptpay'],
      payment_method_data: { type: 'promptpay', billing_details: { email } },
      confirm: 'true',
      description: (input.description || 'SCLUO-DIO Photobooth').slice(0, 200),
      metadata: { payment_id: id, org_id: auth.org.id, kiosk_id: auth.kiosk.kioskId, product: input.product.slice(0, 100) }
    },
    id
  );
  const qr = intent?.next_action?.promptpay_display_qr_code;
  if (!qr?.data) throw new PaymentFlowError('PM0003', 502, 'Stripe ไม่ได้ส่ง QR PromptPay กลับมา');
  const expiresAt = new Date(Date.now() + rules.qrTimeoutSec * 1000);
  await db().insert(payments).values({
    id,
    orgId: auth.org.id,
    kioskRowId: auth.kiosk.id,
    branchId: auth.kiosk.branchId,
    account: acct.account,
    mode: intent.livemode ? 'live' : 'test',
    stripeIntentId: String(intent.id),
    stripeAccountId: acct.call.stripeAccount ?? null,
    amount: thb,
    product: input.product.slice(0, 100),
    description: (input.description || '').slice(0, 200),
    status: statusOf(intent),
    expiresAt
  });
  return {
    id,
    amount: thb,
    qrData: String(qr.data),
    qrImageUrl: qr.image_url_png ?? null,
    testPageUrl: intent.livemode ? null : (qr.hosted_instructions_url ?? null),
    livemode: !!intent.livemode,
    account: acct.account,
    expiresAt: expiresAt.getTime()
  };
}

async function callFor(row: Payment): Promise<StripeCall> {
  // The payment stays with the account it was made on, even if the shop switched since
  const call = await callForPayment(row.orgId, row.account, row.mode, row.stripeAccountId);
  if (!call) throw new PaymentFlowError('PM0001', 503, 'key ของบัญชี Stripe ที่รับรายการนี้ถูกลบแล้ว');
  return call;
}

/** Saves a PaymentIntent's state; on success also Stripe's fee and the net amount. */
async function record(row: Payment, intent: any, source: 'webhook' | 'poll' | 'cancel', call?: StripeCall) {
  const status = statusOf(intent);
  if (status === row.status) return row;
  const patch: Partial<Payment> = { status };
  if (status === 'succeeded') {
    patch.paidAt = new Date();
    patch.confirmedBy = source === 'webhook' ? 'webhook' : 'poll';
    // Stripe usually books the fee a few seconds after the payment: fillMissingFees() catches up
    Object.assign(patch, await feeOf(row, call).catch(() => ({})));
  }
  // Never move a final state backwards (a late webhook after a poll, etc.)
  await db().update(payments).set(patch).where(and(eq(payments.id, row.id), sql`${payments.status} not in ('succeeded','canceled','failed','refunded')`));
  return { ...row, ...patch };
}

/** Stripe's fee and the net amount of a paid payment (empty while Stripe has not booked it yet). */
async function feeOf(row: Payment, call?: StripeCall): Promise<Pick<Payment, 'feeSatang' | 'netSatang'> | Record<string, never>> {
  const c = call ?? (await callFor(row));
  const full = await stripeRequest(c, 'GET', `/payment_intents/${row.stripeIntentId}?expand[]=latest_charge.balance_transaction`);
  const bt = full?.latest_charge?.balance_transaction;
  return bt && typeof bt === 'object' ? { feeSatang: Number(bt.fee) || 0, netSatang: Number(bt.net) || 0 } : {};
}

/** Paid payments whose fee is not known yet (for the revenue report). */
export async function fillMissingFees(limit = 20) {
  const rows = await db()
    .select()
    .from(payments)
    .where(and(eq(payments.status, 'succeeded'), isNull(payments.feeSatang), lt(payments.paidAt, new Date(Date.now() - 10_000))))
    .orderBy(desc(payments.paidAt))
    .limit(limit);
  for (const row of rows) {
    const fee = await feeOf(row).catch(() => ({}));
    if ('feeSatang' in fee) await db().update(payments).set(fee).where(eq(payments.id, row.id));
  }
}

async function kioskPayment(auth: KioskAuth, id: string): Promise<Payment> {
  const row = (await db().select().from(payments).where(and(eq(payments.id, id), eq(payments.kioskRowId, auth.kiosk.id))).limit(1))[0];
  if (!row) throw new PaymentFlowError('PM0004', 404, 'ไม่พบรายการนี้');
  return row;
}

export async function kioskPaymentState(auth: KioskAuth, id: string) {
  let row = await kioskPayment(auth, id);
  if (!FINAL.has(row.status)) {
    const call = await callFor(row);
    const intent = await stripeRequest(call, 'GET', `/payment_intents/${row.stripeIntentId}`);
    row = await record(row, intent, 'poll', call);
    // Expired and still unpaid: cancel so the old QR can never be paid late
    if (!FINAL.has(row.status) && row.expiresAt.getTime() + 15_000 < Date.now()) row = await cancelRow(row);
  }
  return { id: row.id, status: row.status === 'requires_action' ? 'requires_action' : row.status, amount: row.amount };
}

async function cancelRow(row: Payment): Promise<Payment> {
  const call = await callFor(row);
  try {
    return await record(row, await stripeRequest(call, 'POST', `/payment_intents/${row.stripeIntentId}/cancel`, { cancellation_reason: 'abandoned' }), 'cancel', call);
  } catch {
    // Already paid or canceled: keep the real state
    return record(row, await stripeRequest(call, 'GET', `/payment_intents/${row.stripeIntentId}`), 'poll', call);
  }
}

export async function cancelKioskPayment(auth: KioskAuth, id: string) {
  const row = await kioskPayment(auth, id);
  const after = FINAL.has(row.status) ? row : await cancelRow(row);
  return { id: after.id, status: after.status };
}

/** Unpaid QR codes of every kiosk that were left open: canceled shortly after they expire. */
export async function sweepExpiredPayments(limit = 10) {
  const rows = await db()
    .select()
    .from(payments)
    .where(and(inArray(payments.status, ['requires_action', 'processing']), lt(payments.expiresAt, new Date(Date.now() - 15_000))))
    .limit(limit);
  for (const row of rows) await cancelRow(row).catch(() => {});
}

/**
 * Stripe webhook. `orgId` null = the company's endpoint (also receives Connect events, with
 * `account`); a shop's own keys have their own endpoint. Returns [status, body].
 */
export async function handleStripeWebhook(rawBody: string, signature: string | null, orgId: string | null): Promise<[number, object]> {
  const secrets = await webhookSecrets(orgId);
  if (!secrets.length) return [400, { error: 'Webhook secret is not configured' }];
  const verifiedModes = secrets.filter((s) => verifyStripeSignature(rawBody, signature, s.secret)).map((s) => s.mode);
  if (!verifiedModes.length) return [400, { error: 'Invalid signature' }];
  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return [400, { error: 'Invalid JSON' }];
  }
  await markWebhook(orgId);
  const obj = event?.data?.object;
  if (obj?.object !== 'payment_intent') return [200, { received: true, ignored: true }];
  const row = (await db().select().from(payments).where(eq(payments.stripeIntentId, String(obj.id))).limit(1))[0];
  if (!row) return [200, { received: true, unknown: true }];
  // An event only counts for the account it came from
  const fromShop = orgId !== null || !!event.account;
  if ((row.account === 'shop') !== fromShop || (orgId && row.orgId !== orgId)) return [200, { received: true, mismatch: true }];
  // A test-mode secret or event can never change a live payment (and the other way round)
  if (!verifiedModes.includes(row.mode as PayMode) || !!event.livemode !== (row.mode === 'live')) return [200, { received: true, mismatch: true }];
  await record(row, obj, 'webhook');
  return [200, { received: true }];
}

/**
 * An AI image takes one paid, unused AI payment made at this kiosk. The price was checked when the
 * QR was created, so a price change after the customer paid never refuses their image.
 * Returns null when claimed, or the `usedBy` holder when this payment already pays another job.
 */
export async function claimPayment(orgId: string, kioskRowId: string, paymentId: string, usedBy: string): Promise<string | null> {
  const res = await db()
    .update(payments)
    .set({ usedBy })
    .where(and(eq(payments.id, paymentId), eq(payments.orgId, orgId), eq(payments.kioskRowId, kioskRowId), eq(payments.status, 'succeeded'), isNull(payments.usedBy), sql`${payments.product} like 'ai:%'`));
  if (res[0].affectedRows === 1) return null;
  const row = (await db().select().from(payments).where(and(eq(payments.id, paymentId), eq(payments.orgId, orgId))).limit(1))[0];
  if (row?.usedBy === usedBy) return null; // the same job retried
  if (row && row.kioskRowId === kioskRowId && row.status === 'succeeded' && row.usedBy) return row.usedBy;
  throw new PaymentFlowError('AD0008', 402, !row || row.kioskRowId !== kioskRowId ? 'ไม่พบการชำระเงินนี้' : row.status !== 'succeeded' ? 'รายการนี้ยังไม่ได้ชำระเงิน' : 'รายการนี้ไม่ใช่การชำระค่าภาพ AI');
}

/** Gives a payment back (the image it paid for could not be made). */
export async function releasePayment(paymentId: string, usedBy: string) {
  await db().update(payments).set({ usedBy: null }).where(and(eq(payments.id, paymentId), eq(payments.usedBy, usedBy)));
}

// ─── Reports ─────────────────────────────────────────────────────────────────

/** Paid totals per customer and account in a period (platform report and CSV). */
export async function revenueByOrg(from: Date, to: Date, mode: PayMode = 'live') {
  return db()
    .select({
      orgId: payments.orgId,
      name: organizations.name,
      account: payments.account,
      count: sql<number>`count(*)`,
      gross: sql<number>`coalesce(sum(${payments.amount}), 0)`,
      feeSatang: sql<number>`coalesce(sum(${payments.feeSatang}), 0)`,
      netSatang: sql<number>`coalesce(sum(${payments.netSatang}), 0)`,
      missingFee: sql<number>`sum(case when ${payments.feeSatang} is null then 1 else 0 end)`
    })
    .from(payments)
    .innerJoin(organizations, eq(organizations.id, payments.orgId))
    .where(and(eq(payments.status, 'succeeded'), eq(payments.mode, mode), gte(payments.paidAt, from), lt(payments.paidAt, to)))
    .groupBy(payments.orgId, organizations.name, payments.account)
    .orderBy(organizations.name);
}

export async function orgPayments(orgId: string, limit = 50) {
  return db().select().from(payments).where(eq(payments.orgId, orgId)).orderBy(desc(payments.createdAt)).limit(limit);
}

/**
 * Gives a customer their money back (full amount) through the Stripe account that received it.
 * Idempotent at Stripe (one refund per payment); recorded on the payment and in the audit log.
 */
export async function refundPayment(ctx: OrgContext, paymentId: string, reason: string, customerEmail = '') {
  assertCan(ctx, 'payment.refund');
  const row = (await db().select().from(payments).where(and(eq(payments.id, paymentId), eq(payments.orgId, ctx.org.id))).limit(1))[0];
  if (!row) throw notFound('รายการชำระเงิน');
  if (row.status === 'refunded') throw new AppError('รายการนี้คืนเงินไปแล้ว', 'conflict');
  if (row.status !== 'succeeded') throw new AppError('คืนเงินได้เฉพาะรายการที่ชำระเงินสำเร็จแล้ว');
  const call = await callFor(row);
  let refund: any;
  try {
    // PromptPay has no way back to the payer's account: Stripe emails the customer to collect
    // their bank details, so it needs the customer's email (the payment only knows the shop's)
    refund = await stripeRequest(
      call,
      'POST',
      '/refunds',
      { payment_intent: row.stripeIntentId, reason: 'requested_by_customer', ...(customerEmail ? { instructions_email: customerEmail } : {}), metadata: { payment_id: row.id, refunded_by: ctx.user.id } },
      `refund-${row.id}-${customerEmail || 'none'}`
    );
  } catch (err) {
    if (err instanceof StripeError && /email|instructions/i.test(err.message) && !customerEmail) {
      throw new AppError('PromptPay คืนเงินกลับบัญชีเดิมอัตโนมัติไม่ได้ กรอกอีเมลลูกค้า Stripe จะส่งอีเมลให้ลูกค้ากรอกบัญชีรับเงินคืน');
    }
    if (err instanceof StripeError && row.mode === 'test' && /verify the email/i.test(err.message)) {
      throw new AppError('โหมดทดสอบของ Stripe ส่งอีเมลคืนเงินได้เฉพาะอีเมลที่ยืนยันแล้วในบัญชี Stripe (โหมดจริงส่งถึงลูกค้าได้ตามปกติ)');
    }
    if (err instanceof StripeError) throw new AppError(`Stripe ไม่รับการคืนเงิน: ${err.message}`);
    throw err;
  }
  if (refund?.status === 'failed' || refund?.status === 'canceled') throw new AppError(`Stripe คืนเงินไม่สำเร็จ (${refund.status})`);
  const now = new Date();
  await db()
    .update(payments)
    .set({ status: 'refunded', refundedAt: now, refundId: String(refund?.id ?? ''), refundedBy: ctx.user.id, refundReason: reason.slice(0, 200), refundStatus: String(refund?.status ?? 'succeeded').slice(0, 20) })
    .where(and(eq(payments.id, row.id), eq(payments.status, 'succeeded')));
  await audit({ user: ctx.user, orgId: ctx.org.id, actingAsPlatform: ctx.actingAsPlatform }, {
    action: 'payment.refund',
    resourceType: 'payment',
    resourceId: row.id,
    before: { status: row.status, amount: row.amount, usedBy: row.usedBy },
    after: { status: 'refunded', refundId: refund?.id ?? null, refundStatus: refund?.status ?? null, reason }
  });
  return { refundStatus: String(refund?.status ?? 'succeeded') };
}

/**
 * AI payments the customer paid for but no image used (the job failed or the kiosk gave up).
 * Shown to the shop so staff can make the image again or refund the customer in Stripe.
 */
export async function unservedAiPayments(orgId: string, olderThanMin = 10) {
  return db()
    .select()
    .from(payments)
    .where(and(eq(payments.orgId, orgId), eq(payments.status, 'succeeded'), isNull(payments.usedBy), sql`${payments.product} like 'ai:%'`, lt(payments.paidAt, new Date(Date.now() - olderThanMin * 60_000))))
    .orderBy(desc(payments.paidAt))
    .limit(100);
}

export function isPaymentError(e: unknown): e is PaymentFlowError | StripeError {
  return e instanceof PaymentFlowError || e instanceof StripeError;
}

/* eslint-enable @typescript-eslint/no-explicit-any */
