import 'server-only';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/server/db/client';
import { orgPaymentAccounts, platformPaymentSettings, type Organization, type OrgPaymentAccount, type PlatformPaymentSettings } from '@/server/db/schema';
import type { OrgContext, PlatformContext } from '@/server/auth/context';
import { audit } from '@/server/audit';
import { decryptSecret, encryptSecret } from '@/server/lib/crypto';
import { AppError } from '@/server/lib/errors';
import { StripeError, stripeAccountInfo, type StripeCall } from '@/server/payments/stripe';

/**
 * Whose Stripe account takes a customer's money: the company's (default) or, when the platform
 * allows it and the owner set it up, the shop's own (its keys, or a Stripe Connect account).
 */

export type PayMode = 'test' | 'live';
const ROW_ID = 1;

const secretKey = (mode: PayMode) =>
  z
    .string()
    .trim()
    .max(300)
    .refine((v) => !v || new RegExp(`^(sk|rk)_${mode}_[A-Za-z0-9]+$`).test(v), `ต้องเป็น Secret key แบบ ${mode === 'live' ? 'จริง (sk_live_…)' : 'ทดสอบ (sk_test_…)'}`)
    .default('');
const kioskKey = (mode: PayMode) =>
  z
    .string()
    .trim()
    .max(300)
    .refine((v) => !v || new RegExp(`^rk_${mode}_[A-Za-z0-9]+$`).test(v), `ต้องเป็น Restricted key แบบ${mode === 'live' ? 'จริง (rk_live_…)' : 'ทดสอบ (rk_test_…)'}`)
    .default('');
const webhookKey = z
  .string()
  .trim()
  .max(300)
  .refine((v) => !v || /^whsec_[A-Za-z0-9]+$/.test(v), 'ต้องเป็น Webhook signing secret (whsec_…)')
  .default('');

export const PaymentKeysInput = z.object({
  testSecret: secretKey('test'),
  testWebhook: webhookKey,
  liveSecret: secretKey('live'),
  liveWebhook: webhookKey,
  testKioskKey: kioskKey('test'),
  liveKioskKey: kioskKey('live'),
  clearKeys: z.array(z.enum(['test', 'live'])).default([]),
  email: z.union([z.literal(''), z.email('อีเมลไม่ถูกต้อง')]).default('')
});
export const OrgPaymentInput = PaymentKeysInput.extend({ active: z.boolean().default(false) });

type KeyRow = Pick<
  PlatformPaymentSettings,
  'testSecretEnc' | 'testWebhookEnc' | 'liveSecretEnc' | 'liveWebhookEnc' | 'testSecretHint' | 'liveSecretHint' | 'testKioskKeyEnc' | 'liveKioskKeyEnc' | 'testKioskKeyHint' | 'liveKioskKeyHint'
>;

export interface KeysSummary {
  test: { secret: boolean; hint: string; webhook: boolean; kioskKey: boolean; kioskHint: string };
  live: { secret: boolean; hint: string; webhook: boolean; kioskKey: boolean; kioskHint: string };
}

function keysSummary(r: KeyRow | undefined): KeysSummary {
  return {
    test: { secret: !!r?.testSecretEnc, hint: r?.testSecretHint ?? '', webhook: !!r?.testWebhookEnc, kioskKey: !!r?.testKioskKeyEnc, kioskHint: r?.testKioskKeyHint ?? '' },
    live: { secret: !!r?.liveSecretEnc, hint: r?.liveSecretHint ?? '', webhook: !!r?.liveWebhookEnc, kioskKey: !!r?.liveKioskKeyEnc, kioskHint: r?.liveKioskKeyHint ?? '' }
  };
}

/** Columns to write for the keys given (blank = keep, `clearKeys` = remove that mode's keys). */
function keyColumns(input: z.infer<typeof PaymentKeysInput>) {
  const cols: Record<string, string | null> = {};
  for (const mode of ['test', 'live'] as const) {
    if (input.clearKeys.includes(mode)) Object.assign(cols, { [`${mode}SecretEnc`]: null, [`${mode}WebhookEnc`]: null, [`${mode}SecretHint`]: '', [`${mode}KioskKeyEnc`]: null, [`${mode}KioskKeyHint`]: '' });
    const secret = input[`${mode}Secret`];
    const webhook = input[`${mode}Webhook`];
    const kiosk = input[`${mode}KioskKey`];
    if (kiosk) Object.assign(cols, { [`${mode}KioskKeyEnc`]: encryptSecret(kiosk), [`${mode}KioskKeyHint`]: kiosk.slice(-4) });
    if (secret) Object.assign(cols, { [`${mode}SecretEnc`]: encryptSecret(secret), [`${mode}SecretHint`]: secret.slice(-4) });
    if (webhook) cols[`${mode}WebhookEnc`] = encryptSecret(webhook);
  }
  return cols;
}

const changedModes = (input: z.infer<typeof PaymentKeysInput>) =>
  (['test', 'live'] as const).filter((m) => input[`${m}Secret`] || input[`${m}Webhook`] || input[`${m}KioskKey`] || input.clearKeys.includes(m));

// ─── The company account ─────────────────────────────────────────────────────

async function platformRow(): Promise<PlatformPaymentSettings | undefined> {
  return (await db().select().from(platformPaymentSettings).where(eq(platformPaymentSettings.id, ROW_ID)).limit(1))[0];
}

export async function platformPaymentSummary() {
  const r = await platformRow();
  return {
    keys: keysSummary(r),
    email: r?.email ?? '',
    lastTestAt: r?.lastTestAt ?? null,
    lastTestOk: r?.lastTestOk ?? null,
    lastTestMessage: r?.lastTestMessage ?? null,
    lastWebhookAt: r?.lastWebhookAt ?? null
  };
}

export async function savePlatformPayment(ctx: PlatformContext, input: z.infer<typeof PaymentKeysInput>) {
  const before = await platformRow();
  const values = { ...keyColumns(input), email: input.email, ...(changedModes(input).length ? { lastTestAt: null, lastTestOk: null, lastTestMessage: null } : {}), updatedBy: ctx.user.id };
  if (before) await db().update(platformPaymentSettings).set(values).where(eq(platformPaymentSettings.id, ROW_ID));
  else await db().insert(platformPaymentSettings).values({ id: ROW_ID, ...values });
  await audit({ user: ctx.user, orgId: null }, {
    action: 'payment.platform_update',
    resourceType: 'platform_payment_settings',
    resourceId: String(ROW_ID),
    before: before ? { email: before.email, hints: { test: before.testSecretHint, live: before.liveSecretHint } } : null,
    after: { email: input.email, keysChanged: changedModes(input), cleared: input.clearKeys }
  });
}

// ─── A shop's own account ────────────────────────────────────────────────────

async function orgRow(orgId: string): Promise<OrgPaymentAccount | undefined> {
  return (await db().select().from(orgPaymentAccounts).where(eq(orgPaymentAccounts.orgId, orgId)).limit(1))[0];
}

export async function orgPaymentSummary(org: Pick<Organization, 'id' | 'ownStripeAllowed'>) {
  const r = await orgRow(org.id);
  return {
    allowed: org.ownStripeAllowed,
    active: !!r?.active,
    /** Money goes to the shop's account now (allowed + switched on + keys / Connect present). */
    inUse: org.ownStripeAllowed && !!r?.active && (r.method === 'connect' ? !!r.connectAccountId : !!(r.testSecretEnc || r.liveSecretEnc)),
    method: r?.method ?? 'keys',
    connectAccountId: r?.connectAccountId ?? null,
    keys: keysSummary(r),
    email: r?.email ?? '',
    accountName: r?.accountName ?? null,
    lastTestAt: r?.lastTestAt ?? null,
    lastTestOk: r?.lastTestOk ?? null,
    lastTestMessage: r?.lastTestMessage ?? null,
    lastWebhookAt: r?.lastWebhookAt ?? null
  };
}

export async function saveOrgPayment(ctx: OrgContext, input: z.infer<typeof OrgPaymentInput>) {
  if (!ctx.org.ownStripeAllowed) throw new AppError('ผู้ให้บริการยังไม่ได้เปิดให้ใช้บัญชี Stripe ของร้านเอง');
  const before = await orgRow(ctx.org.id);
  const values = {
    ...keyColumns(input),
    method: 'keys' as const,
    active: input.active,
    email: input.email,
    ...(changedModes(input).length ? { lastTestAt: null, lastTestOk: null, lastTestMessage: null } : {}),
    updatedBy: ctx.user.id
  };
  const after = { ...before, ...values } as OrgPaymentAccount;
  if (input.active && !after.testSecretEnc && !after.liveSecretEnc) throw new AppError('ใส่ Secret key อย่างน้อยหนึ่งโหมดก่อนเปิดใช้บัญชีของร้าน');
  if (before) await db().update(orgPaymentAccounts).set(values).where(eq(orgPaymentAccounts.orgId, ctx.org.id));
  else await db().insert(orgPaymentAccounts).values({ orgId: ctx.org.id, ...values });
  await audit({ user: ctx.user, orgId: ctx.org.id, actingAsPlatform: ctx.actingAsPlatform }, {
    action: 'payment.own_account_update',
    resourceType: 'org_payment_account',
    resourceId: ctx.org.id,
    before: before ? { active: before.active, email: before.email, hints: { test: before.testSecretHint, live: before.liveSecretHint } } : null,
    after: { active: input.active, email: input.email, keysChanged: changedModes(input), cleared: input.clearKeys }
  });
}

// ─── Which account takes a payment ───────────────────────────────────────────

export interface ResolvedAccount {
  account: 'platform' | 'shop';
  call: StripeCall;
  webhookSecret: string | null;
  email: string;
  /** Restricted key for kiosks selling while the Admin is unreachable (null = not set up). */
  kioskKey: string | null;
}

/** The account for a customer's payment in `mode`, or null when none is set up for that mode. */
export async function accountFor(org: Pick<Organization, 'id' | 'ownStripeAllowed'>, mode: PayMode): Promise<ResolvedAccount | null> {
  const platform = await platformRow();
  const own = org.ownStripeAllowed ? await orgRow(org.id) : undefined;
  const secretOf = (r: KeyRow | undefined) => (r?.[`${mode}SecretEnc`] ? decryptSecret(r[`${mode}SecretEnc`]!) : null);
  const webhookOf = (r: KeyRow | undefined) => (r?.[`${mode}WebhookEnc`] ? decryptSecret(r[`${mode}WebhookEnc`]!) : null);
  const kioskOf = (r: KeyRow | undefined) => (r?.[`${mode}KioskKeyEnc`] ? decryptSecret(r[`${mode}KioskKeyEnc`]!) : null);
  if (own?.active) {
    if (own.method === 'connect' && own.connectAccountId && secretOf(platform)) {
      return { account: 'shop', call: { secret: secretOf(platform)!, stripeAccount: own.connectAccountId }, webhookSecret: webhookOf(platform), email: own.email || platform?.email || '', kioskKey: kioskOf(platform) };
    }
    const secret = secretOf(own);
    if (own.method === 'keys' && secret) return { account: 'shop', call: { secret }, webhookSecret: webhookOf(own), email: own.email || platform?.email || '', kioskKey: kioskOf(own) };
  }
  const secret = secretOf(platform);
  return secret ? { account: 'platform', call: { secret }, webhookSecret: webhookOf(platform), email: platform?.email ?? '', kioskKey: kioskOf(platform) } : null;
}

/**
 * The account an existing payment was made on (to check, cancel or read its fee), even when
 * the shop has switched accounts since. Null when those keys were removed.
 */
export async function callForPayment(orgId: string, account: 'platform' | 'shop', mode: PayMode, stripeAccountId: string | null): Promise<StripeCall | null> {
  const platform = await platformRow();
  const secretOf = (r: KeyRow | undefined) => (r?.[`${mode}SecretEnc`] ? decryptSecret(r[`${mode}SecretEnc`]!) : null);
  if (account === 'platform' || stripeAccountId) {
    const secret = secretOf(platform);
    return secret ? { secret, stripeAccount: stripeAccountId } : null;
  }
  const secret = secretOf(await orgRow(orgId));
  return secret ? { secret } : null;
}

/** Webhook secrets to check a Stripe event against: the company's, or one shop's own. */
export async function webhookSecrets(orgId: string | null): Promise<{ mode: PayMode; secret: string }[]> {
  const r = orgId ? await orgRow(orgId) : await platformRow();
  const out: { mode: PayMode; secret: string }[] = [];
  for (const mode of ['test', 'live'] as const) {
    const enc = r?.[`${mode}WebhookEnc`];
    if (enc) out.push({ mode, secret: decryptSecret(enc) });
  }
  return out;
}

export async function markWebhook(orgId: string | null) {
  if (orgId) await db().update(orgPaymentAccounts).set({ lastWebhookAt: new Date() }).where(eq(orgPaymentAccounts.orgId, orgId));
  else await db().update(platformPaymentSettings).set({ lastWebhookAt: new Date() }).where(eq(platformPaymentSettings.id, ROW_ID));
}

/** Connection test of one mode (free: reads the account). */
async function testKeys(call: StripeCall | null, mode: PayMode): Promise<{ ok: boolean; message: string; name?: string }> {
  if (!call) return { ok: false, message: `ยังไม่ได้ใส่ Secret key โหมด${mode === 'live' ? 'จริง' : 'ทดสอบ'}` };
  try {
    const a = await stripeAccountInfo(call);
    const warn = [a.country !== 'TH' ? `ประเทศของบัญชีคือ ${a.country} (PromptPay ต้องเป็นบัญชีไทย)` : '', !a.chargesEnabled ? 'บัญชียังรับชำระเงินไม่ได้' : ''].filter(Boolean).join(' • ');
    return { ok: !warn, message: `${a.name} (${a.country}) • โหมด${mode === 'live' ? 'จริง' : 'ทดสอบ'}${warn ? ` • ${warn}` : ''}`, name: a.name };
  } catch (e) {
    return { ok: false, message: e instanceof StripeError ? `[${e.code}] ${e.message}` : String(e) };
  }
}

export async function testPlatformPayment(ctx: PlatformContext, mode: PayMode) {
  const r = await platformRow();
  const result = await testKeys(r?.[`${mode}SecretEnc`] ? { secret: decryptSecret(r[`${mode}SecretEnc`]!) } : null, mode);
  if (r) await db().update(platformPaymentSettings).set({ lastTestAt: new Date(), lastTestOk: result.ok, lastTestMessage: result.message.slice(0, 500) }).where(eq(platformPaymentSettings.id, ROW_ID));
  await audit({ user: ctx.user, orgId: null }, { action: 'payment.platform_test', resourceType: 'platform_payment_settings', resourceId: String(ROW_ID), after: { mode, ok: result.ok } });
  return result;
}

export async function testOrgPayment(ctx: OrgContext, mode: PayMode) {
  const r = await orgRow(ctx.org.id);
  const result = await testKeys(r?.[`${mode}SecretEnc`] ? { secret: decryptSecret(r[`${mode}SecretEnc`]!) } : null, mode);
  if (r) {
    await db()
      .update(orgPaymentAccounts)
      .set({ lastTestAt: new Date(), lastTestOk: result.ok, lastTestMessage: result.message.slice(0, 500), ...(result.name ? { accountName: result.name.slice(0, 120) } : {}) })
      .where(eq(orgPaymentAccounts.orgId, ctx.org.id));
  }
  await audit({ user: ctx.user, orgId: ctx.org.id, actingAsPlatform: ctx.actingAsPlatform }, { action: 'payment.own_account_test', resourceType: 'org_payment_account', resourceId: ctx.org.id, after: { mode, ok: result.ok } });
  return result;
}
