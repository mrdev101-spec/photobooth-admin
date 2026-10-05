import 'server-only';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/server/db/client';
import { AI_PROVIDER_SETTINGS, platformAiSettings, type PlatformAiSettings } from '@/server/db/schema';
import type { PlatformContext } from '@/server/auth/context';
import { audit } from '@/server/audit';
import { decryptSecret, encryptSecret } from '@/server/lib/crypto';
import { AppError } from '@/server/lib/errors';
import { AI_PROVIDERS, AI_PROVIDER_IDS, THAI_TEXT_DEFAULT, THAI_TEXT_MODELS, detectProvider, testEngine, AiEngineError, type AiProvider, type Engine } from '@/server/ai/engine';

/** The platform's AI account: one key per provider for every customer, set by the platform team. */

const ROW_ID = 1;
const keyField = z.string().trim().max(300).default('');

export const AiSettingsInput = z.object({
  provider: z.enum(AI_PROVIDER_SETTINGS),
  openaiKey: keyField,
  openrouterKey: keyField,
  googleKey: keyField,
  clearKeys: z.array(z.enum(['openai', 'openrouter', 'google'])).default([]),
  openaiModel: z.string().trim().max(80).optional(),
  openrouterModel: z.string().trim().max(80).optional(),
  googleModel: z.string().trim().max(80).optional(),
  thaiTextModel: z.string().trim().max(80).optional(),
  imageSize: z.enum(['1K', '2K']),
  faceRefine: z.boolean().default(false)
});

export interface AiSettingsSummary {
  configured: boolean;
  /** The provider used for ordinary scenes ('auto' resolved), null without any key. */
  activeProvider: AiProvider | null;
  activeModel: string | null;
  providerSetting: (typeof AI_PROVIDER_SETTINGS)[number];
  keys: Record<AiProvider, { set: boolean; hint: string }>;
  models: Record<AiProvider, string>;
  thaiTextModel: string;
  /** How Thai-lettering scenes reach a GPT Image model: 'openai', 'openrouter' or '' (configured model). */
  thaiTextRoute: '' | 'openai' | 'openrouter';
  imageSize: '1K' | '2K';
  faceRefine: boolean;
  lastTestAt: Date | null;
  lastTestOk: boolean | null;
  lastTestMessage: string | null;
  updatedAt: Date | null;
}

async function row(): Promise<PlatformAiSettings | undefined> {
  return (await db().select().from(platformAiSettings).where(eq(platformAiSettings.id, ROW_ID)).limit(1))[0];
}

const encOf = (r: PlatformAiSettings | undefined, p: AiProvider) => (r ? { openai: r.openaiKeyEnc, openrouter: r.openrouterKeyEnc, google: r.googleKeyEnc }[p] : null);
const hintOf = (r: PlatformAiSettings | undefined, p: AiProvider) => (r ? { openai: r.openaiKeyHint, openrouter: r.openrouterKeyHint, google: r.googleKeyHint }[p] : '');

function modelOf(r: PlatformAiSettings | undefined, p: AiProvider): string {
  const saved = r ? { openai: r.openaiModel, openrouter: r.openrouterModel, google: r.googleModel }[p] : null;
  return saved && AI_PROVIDERS[p].models[saved] ? saved : AI_PROVIDERS[p].defaultModel;
}

function activeProvider(r: PlatformAiSettings | undefined): AiProvider | null {
  if (!r) return null;
  if (r.provider !== 'auto') return encOf(r, r.provider) ? r.provider : null;
  return AI_PROVIDER_IDS.find((p) => encOf(r, p)) ?? null;
}

const thaiModelOf = (r: PlatformAiSettings | undefined) => (r?.thaiTextModel && THAI_TEXT_MODELS[r.thaiTextModel] ? r.thaiTextModel : THAI_TEXT_DEFAULT);

/** Safe to show (no keys). */
export async function aiSettingsSummary(): Promise<AiSettingsSummary> {
  const r = await row();
  const active = activeProvider(r);
  return {
    configured: !!active,
    activeProvider: active,
    activeModel: active ? modelOf(r, active) : null,
    providerSetting: r?.provider ?? 'auto',
    keys: Object.fromEntries(AI_PROVIDER_IDS.map((p) => [p, { set: !!encOf(r, p), hint: hintOf(r, p) }])) as AiSettingsSummary['keys'],
    models: Object.fromEntries(AI_PROVIDER_IDS.map((p) => [p, modelOf(r, p)])) as AiSettingsSummary['models'],
    thaiTextModel: thaiModelOf(r),
    thaiTextRoute: encOf(r, 'openai') ? 'openai' : encOf(r, 'openrouter') ? 'openrouter' : '',
    imageSize: r?.imageSize ?? '1K',
    faceRefine: r?.faceRefine ?? true,
    lastTestAt: r?.lastTestAt ?? null,
    lastTestOk: r?.lastTestOk ?? null,
    lastTestMessage: r?.lastTestMessage ?? null,
    updatedAt: r?.updatedAt ?? null
  };
}

export interface EngineChoice {
  engine: Engine;
  faceRefine: boolean;
}

/**
 * Provider + model for one scene: the configured one, or for Thai-lettering scenes a GPT Image
 * model (OpenAI key first, then OpenRouter's openai/ models). Null when no key is set.
 */
export async function engineForScene(thaiText: boolean): Promise<EngineChoice | null> {
  const r = await row();
  const active = activeProvider(r);
  if (!r || !active) return null;
  const key = (p: AiProvider) => decryptSecret(encOf(r, p)!);
  const base: Engine = { provider: active, apiKey: key(active), model: modelOf(r, active), imageSize: r.imageSize };
  if (thaiText) {
    const name = thaiModelOf(r);
    if (r.openaiKeyEnc) return { engine: { provider: 'openai', apiKey: key('openai'), model: name, imageSize: r.imageSize }, faceRefine: r.faceRefine };
    if (r.openrouterKeyEnc && AI_PROVIDERS.openrouter.models[`openai/${name}`]) {
      return { engine: { provider: 'openrouter', apiKey: key('openrouter'), model: `openai/${name}`, imageSize: r.imageSize }, faceRefine: r.faceRefine };
    }
  }
  return { engine: base, faceRefine: r.faceRefine };
}

export async function saveAiSettings(ctx: PlatformContext, input: z.infer<typeof AiSettingsInput>) {
  const before = await row();
  const given: Partial<Record<AiProvider, string>> = {};
  for (const [field, provider] of [['openaiKey', 'openai'], ['openrouterKey', 'openrouter'], ['googleKey', 'google']] as const) {
    const key = input[field];
    if (!key) continue;
    if (detectProvider(key) !== provider) throw new AppError(`Key ในช่อง ${AI_PROVIDERS[provider].label} ดูไม่ใช่ key ของผู้ให้บริการนี้`);
    given[provider] = key;
  }
  const keyCols = (p: AiProvider) => {
    const enc = `${p}KeyEnc` as const;
    const hint = `${p}KeyHint` as const;
    if (given[p]) return { [enc]: encryptSecret(given[p]!), [hint]: given[p]!.slice(-4) };
    if (input.clearKeys.includes(p)) return { [enc]: null, [hint]: '' };
    return {};
  };
  const pick = (p: AiProvider, v: string | undefined) => (v && AI_PROVIDERS[p].models[v] ? v : modelOf(before, p));
  const values = {
    provider: input.provider,
    ...keyCols('openai'),
    ...keyCols('openrouter'),
    ...keyCols('google'),
    openaiModel: pick('openai', input.openaiModel),
    openrouterModel: pick('openrouter', input.openrouterModel),
    googleModel: pick('google', input.googleModel),
    thaiTextModel: input.thaiTextModel && THAI_TEXT_MODELS[input.thaiTextModel] ? input.thaiTextModel : thaiModelOf(before),
    imageSize: input.imageSize,
    faceRefine: input.faceRefine,
    ...(Object.keys(given).length || input.clearKeys.length ? { lastTestAt: null, lastTestOk: null, lastTestMessage: null } : {}),
    updatedBy: ctx.user.id
  };
  if (before) await db().update(platformAiSettings).set(values).where(eq(platformAiSettings.id, ROW_ID));
  else await db().insert(platformAiSettings).values({ id: ROW_ID, ...values });

  await audit({ user: ctx.user, orgId: null }, {
    action: 'ai.settings_update',
    resourceType: 'platform_ai_settings',
    resourceId: String(ROW_ID),
    before: before ? { provider: before.provider, imageSize: before.imageSize, faceRefine: before.faceRefine, keyHints: { openai: before.openaiKeyHint, openrouter: before.openrouterKeyHint, google: before.googleKeyHint } } : null,
    after: { provider: values.provider, imageSize: values.imageSize, faceRefine: values.faceRefine, keysReplaced: Object.keys(given), keysCleared: input.clearKeys }
  });
}

/** Checks the active key (free metadata call) and remembers the outcome for the settings page. */
export async function testAiSettings(ctx: PlatformContext): Promise<{ ok: boolean; message: string }> {
  const choice = await engineForScene(false);
  if (!choice) throw new AppError('ยังไม่ได้ใส่ API Key');
  let result: { ok: boolean; message: string };
  try {
    const r = await testEngine(choice.engine);
    result = { ok: true, message: `${r.displayName}${r.balanceUsd != null ? ` • เครดิตคงเหลือ $${r.balanceUsd}` : ''}` };
  } catch (e) {
    result = { ok: false, message: e instanceof AiEngineError ? `[${e.code}] ${e.message}` : String(e) };
  }
  await db().update(platformAiSettings).set({ lastTestAt: new Date(), lastTestOk: result.ok, lastTestMessage: result.message.slice(0, 500) }).where(eq(platformAiSettings.id, ROW_ID));
  await audit({ user: ctx.user, orgId: null }, { action: 'ai.settings_test', resourceType: 'platform_ai_settings', resourceId: String(ROW_ID), after: { ok: result.ok } });
  return result;
}
