/** Production environment check (instrumentation.ts). Pure: takes the env, returns problems. */
export function checkProductionEnv(env: Record<string, string | undefined>): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const has = (k: string) => !!env[k]?.trim();

  if (!has('DATABASE_URL')) errors.push('DATABASE_URL is not set');
  if (!has('MASTER_KEY')) errors.push('MASTER_KEY is not set');
  else if (Buffer.from(env.MASTER_KEY!.trim(), 'base64').length !== 32) errors.push('MASTER_KEY must be 32 random bytes in base64');
  if (!has('ADMIN_PUBLIC_URL')) errors.push('ADMIN_PUBLIC_URL is not set (Stripe webhooks, kiosk asset and phone upload links are built from it)');
  else if (!env.ADMIN_PUBLIC_URL!.startsWith('https://')) errors.push('ADMIN_PUBLIC_URL must be an https URL');

  if (!has('RESEND_API_KEY') || !has('EMAIL_FROM')) errors.push('RESEND_API_KEY and EMAIL_FROM are required: platform admins and shop owners sign in with an email code');

  if (env.DATABASE_SSL !== 'true') warnings.push('DATABASE_SSL is not "true": only acceptable when the database is on the same private network');
  if (!has('CRON_SECRET')) warnings.push('CRON_SECRET is not set: /internal/cron/housekeeping is off (stuck AI jobs, payable expired QR codes and old sessions are not cleaned)');
  const r2 = ['PLATFORM_R2_ACCOUNT_ID', 'PLATFORM_R2_BUCKET', 'PLATFORM_R2_ACCESS_KEY_ID', 'PLATFORM_R2_SECRET_ACCESS_KEY', 'PLATFORM_R2_PUBLIC_URL'];
  if (r2.some((k) => !has(k))) warnings.push(`template storage incomplete (${r2.filter((k) => !has(k)).join(', ')}): template uploads will fail`);
  for (const k of ['SEED_ADMIN_PASSWORD', 'TEST_OTHERCO_OWNER_PASSWORD', 'TEST_PARTYBOOTH_OWNER_PASSWORD']) {
    if (has(k)) warnings.push(`${k} is set: remove it after the first seed (it is a plain-text password)`);
  }
  for (const k of ['STRIPE_API_BASE_URL', 'AI_OPENAI_BASE_URL', 'AI_OPENROUTER_BASE_URL', 'AI_GOOGLE_BASE_URL']) {
    if (has(k)) warnings.push(`${k} is set: secret keys are sent to ${env[k]} instead of the provider`);
  }
  return { errors, warnings };
}
