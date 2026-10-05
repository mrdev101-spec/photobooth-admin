import 'server-only';

/*
 * Image generation through the platform's AI account (ported from the kiosk's aiStudio.cjs).
 * Three providers: OpenAI (GPT Image), OpenRouter (Nano Banana / GPT Image) and Google
 * (Gemini API). Errors carry the kiosk's catalogue codes (CR credit, AK key, RL rate limit,
 * NW network, SF safety, PV provider) so the customer screen and System Log read the same.
 */

// Overridable for a proxy (or a stand-in provider in tests): AI_GOOGLE_BASE_URL etc.
const GOOGLE_API_BASE = process.env.AI_GOOGLE_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta';
const OPENROUTER_API_BASE = process.env.AI_OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
const OPENAI_API_BASE = process.env.AI_OPENAI_BASE_URL || 'https://api.openai.com/v1';
const REQUEST_TIMEOUT_MS = 120_000;
const OPENAI_TIMEOUT_MS = 180_000; // GPT Image at high quality can take up to ~2 minutes
const ASPECT_RATIO = '2:3'; // 4x6" photo paper

export type AiProvider = 'openai' | 'openrouter' | 'google';
export const AI_PROVIDER_IDS: AiProvider[] = ['openai', 'openrouter', 'google'];

export const AI_PROVIDERS: Record<AiProvider, { label: string; defaultModel: string; models: Record<string, string> }> = {
  openai: {
    label: 'OpenAI',
    defaultModel: 'gpt-image-2.5-sunburst',
    models: {
      'gpt-image-2.5-sunburst': 'GPT Image 2.5 Sunburst - แนะนำ (แก้ภาพ/รักษาหน้าแม่นที่สุด)',
      'gpt-image-2.5-flare': 'GPT Image 2.5 Flare - เร็วกว่า',
      'gpt-image-2': 'GPT Image 2',
      'gpt-image-1.5': 'GPT Image 1.5 (รุ่นเก่า)'
    }
  },
  openrouter: {
    label: 'OpenRouter',
    defaultModel: 'google/gemini-3.1-flash-image',
    models: {
      'google/gemini-3.1-flash-image': 'Nano Banana 2 (Flash) - แนะนำ',
      'google/gemini-3-pro-image': 'Nano Banana Pro - คุณภาพสูงสุด (ช้ากว่า / แพงกว่า)',
      'openai/gpt-image-2.5-sunburst': 'OpenAI GPT Image 2.5 Sunburst - รักษาหน้าแม่นที่สุด (ช้ากว่า)',
      'openai/gpt-image-2.5-flare': 'OpenAI GPT Image 2.5 Flare - เร็วกว่า',
      'openai/gpt-image-2': 'OpenAI GPT Image 2'
    }
  },
  google: {
    label: 'Google AI Studio (Gemini API)',
    defaultModel: 'gemini-3.1-flash-image',
    models: {
      'gemini-3.1-flash-image': 'Nano Banana 2 (Flash) - แนะนำ',
      'gemini-3-pro-image': 'Nano Banana Pro - คุณภาพสูงสุด (ช้ากว่า / แพงกว่า)'
    }
  }
};

/** Scenes with Thai lettering are drawn by a GPT Image model (others misspell Thai). */
export const THAI_TEXT_MODELS: Record<string, string> = {
  'gpt-image-2.5-sunburst': 'GPT Image 2.5 Sunburst - แนะนำ (ตัวอักษรไทยแม่นที่สุด)',
  'gpt-image-2.5-flare': 'GPT Image 2.5 Flare - เร็วกว่า',
  'gpt-image-2': 'GPT Image 2'
};
export const THAI_TEXT_DEFAULT = 'gpt-image-2.5-sunburst';

export interface AiImage {
  mimeType: string;
  /** base64 */
  data: string;
}

export interface Engine {
  provider: AiProvider;
  apiKey: string;
  model: string;
  imageSize: '1K' | '2K';
}

export class AiEngineError extends Error {
  readonly code: string;
  constructor(
    message: string,
    readonly status: number,
    code?: string
  ) {
    super(message);
    this.code = code ?? codeForStatus(status);
  }
}

// Fallback code when a throw site doesn't name one
function codeForStatus(status: number): string {
  if (status === 402) return 'CR0001';
  if (status === 401 || status === 403) return 'AK0002';
  if (status === 429) return 'RL0001';
  if (status === 504) return 'NW0002';
  if (status === 503) return 'NW0001';
  if (status >= 500) return 'PV0001';
  if (status >= 400) return 'PV0002';
  return 'UN0000';
}

/** OpenRouter keys are "sk-or-...", OpenAI "sk-..." / "sk-proj-...", Google "AIza...". */
export function detectProvider(key: string): AiProvider {
  if (/^sk-or-/i.test(key)) return 'openrouter';
  if (/^sk-/i.test(key)) return 'openai';
  return 'google';
}

function authHeaders(provider: AiProvider, apiKey: string): Record<string, string> {
  if (provider === 'openrouter') return { Authorization: `Bearer ${apiKey}`, 'HTTP-Referer': 'https://scluo-dio.local', 'X-Title': 'SCLUO-DIO AI Studio' };
  if (provider === 'openai') return { Authorization: `Bearer ${apiKey}` };
  return { 'x-goog-api-key': apiKey };
}

// Messages staff can act on. 402 = "not fixable by retrying", so the kiosk doesn't auto-retry.
function providerError(provider: AiProvider, status: number, msg: string, errCode?: unknown): AiEngineError {
  if (provider === 'openai') {
    const text = `${errCode ?? ''} ${msg}`;
    if (status === 401) return new AiEngineError('API Key ของ OpenAI ไม่ถูกต้องหรือถูกปิดใช้งาน', 401, 'AK0002');
    if (/insufficient_quota|billing_hard_limit/i.test(text)) {
      return new AiEngineError('เครดิต/วงเงินของบัญชี OpenAI หมด กรุณาเติมเงินที่ platform.openai.com/settings/organization/billing', 402, 'CR0003');
    }
    if ((status === 403 && /verif/i.test(msg)) || (status === 404 && /model/i.test(msg))) {
      return new AiEngineError(`บัญชี OpenAI นี้ยังใช้โมเดลที่เลือกไม่ได้ (อาจต้องยืนยันองค์กร): ${msg}`, 402, 'AK0003');
    }
    if (/moderation_blocked|safety system|content_policy/i.test(text)) {
      return new AiEngineError(`ระบบความปลอดภัยของ OpenAI ปฏิเสธภาพ: ${msg}`, 422, 'SF0001');
    }
  }
  if (provider === 'google' && status === 429 && /free tier/i.test(msg)) {
    return new AiEngineError('API Key นี้ยังเป็น Free Tier ซึ่งใช้โมเดลสร้างภาพไม่ได้ ต้องเปิด Billing ในโปรเจกต์ Google AI Studio ก่อน', 402, 'CR0002');
  }
  if (provider === 'openrouter' && status === 402) {
    return new AiEngineError('เครดิต OpenRouter ไม่พอ กรุณาเติมเครดิตที่ openrouter.ai/settings/credits', 402, 'CR0001');
  }
  if (provider === 'openrouter' && status === 401) {
    return new AiEngineError('API Key ของ OpenRouter ไม่ถูกต้องหรือถูกปิดใช้งาน', 401, 'AK0002');
  }
  // Google reports a bad key as HTTP 400 "API key not valid"
  if (/api key not valid|invalid api key|permission denied/i.test(msg)) return new AiEngineError(msg, status, 'AK0002');
  return new AiEngineError(msg, status);
}

interface RequestOpts {
  provider: AiProvider;
  apiKey: string;
  body?: unknown;
  form?: FormData;
  timeoutMs?: number;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- provider responses are walked dynamically */
async function requestJson(method: string, url: string, { provider, apiKey, body, form, timeoutMs = REQUEST_TIMEOUT_MS }: RequestOpts): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      // For multipart (form) uploads fetch sets the Content-Type with the boundary itself
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...authHeaders(provider, apiKey) },
      body: form ?? (body ? JSON.stringify(body) : undefined),
      signal: controller.signal
    });
    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {}
    if (!res.ok) {
      const msg = json?.error?.message ?? json?.error ?? (text.slice(0, 300) || `HTTP ${res.status}`);
      throw providerError(provider, res.status, String(msg), json?.error?.code);
    }
    return json;
  } catch (e) {
    if (e instanceof AiEngineError) throw e;
    if (e instanceof Error && e.name === 'AbortError') throw new AiEngineError('AI ใช้เวลานานเกินกำหนด (timeout)', 504, 'NW0002');
    throw new AiEngineError(`เชื่อมต่อ ${AI_PROVIDERS[provider].label} ไม่ได้: ${e instanceof Error ? e.message : String(e)}`, 503, 'NW0001');
  } finally {
    clearTimeout(timer);
  }
}

const postJson = (url: string, opts: RequestOpts) => requestJson('POST', url, opts);

function parseDataUrl(dataUrl: string): AiImage | null {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(dataUrl || '');
  return match?.[1] && match[2] ? { mimeType: match[1].toLowerCase(), data: match[2] } : null;
}

/** The last image payload anywhere in a response (Gemini, generateContent and OpenRouter shapes). */
function findOutputImage(node: unknown): AiImage | null {
  let found: AiImage | null = null;
  const visit = (value: any) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const mime = value.mime_type || value.mimeType || value.media_type;
    if (typeof value.data === 'string' && value.data.length > 100 && typeof mime === 'string' && mime.startsWith('image/')) {
      found = { mimeType: mime, data: value.data };
    }
    if (typeof value.b64_json === 'string' && value.b64_json.length > 100) {
      found = { mimeType: typeof mime === 'string' && mime.startsWith('image/') ? mime : 'image/png', data: value.b64_json };
    }
    if (typeof value.url === 'string' && value.url.startsWith('data:image/')) {
      const parsed = parseDataUrl(value.url);
      if (parsed) found = parsed;
    }
    Object.values(value).forEach(visit);
  };
  visit(node);
  return found;
}

function findText(node: unknown): string {
  const texts: string[] = [];
  const visit = (value: any) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value.text === 'string' && value.text.trim()) texts.push(value.text.trim());
    Object.values(value).forEach(visit);
  };
  visit(node);
  return texts.join(' ').slice(0, 300);
}

interface GenerateArgs {
  apiKey: string;
  model: string;
  imageSize: '1K' | '2K';
  prompt: string;
  images: AiImage[];
}

/** Google: the Interactions API, falling back to generateContent when it is rejected (400/404). */
async function googleGenerate({ apiKey, model, imageSize, prompt, images }: GenerateArgs) {
  const opts = { provider: 'google' as const, apiKey };
  try {
    return await postJson(`${GOOGLE_API_BASE}/interactions`, {
      ...opts,
      body: {
        model,
        store: false,
        input: [{ type: 'text', text: prompt }, ...images.map((img) => ({ type: 'image', mime_type: img.mimeType, data: img.data }))],
        response_format: { type: 'image', mime_type: 'image/jpeg', aspect_ratio: ASPECT_RATIO, image_size: imageSize }
      }
    });
  } catch (e) {
    if (!(e instanceof AiEngineError) || (e.status !== 400 && e.status !== 404)) throw e;
    return postJson(`${GOOGLE_API_BASE}/models/${encodeURIComponent(model)}:generateContent`, {
      ...opts,
      body: {
        contents: [{ role: 'user', parts: [{ text: prompt }, ...images.map((img) => ({ inline_data: { mime_type: img.mimeType, data: img.data } }))] }],
        generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: ASPECT_RATIO, imageSize } }
      }
    });
  }
}

/** OpenRouter: the Images API, falling back to chat completions with image output (404/405). */
async function openrouterGenerate({ apiKey, model, imageSize, prompt, images }: GenerateArgs) {
  const isOpenAiModel = model.startsWith('openai/');
  const opts = { provider: 'openrouter' as const, apiKey, timeoutMs: isOpenAiModel ? OPENAI_TIMEOUT_MS : REQUEST_TIMEOUT_MS };
  const refs = images.map((img) => ({ type: 'image_url', image_url: { url: `data:${img.mimeType};base64,${img.data}` } }));
  try {
    return await postJson(`${OPENROUTER_API_BASE}/images`, {
      ...opts,
      body: {
        model,
        prompt,
        aspect_ratio: ASPECT_RATIO,
        ...(isOpenAiModel ? { quality: 'high' } : { resolution: imageSize, output_format: 'jpeg' }),
        n: 1,
        ...(refs.length ? { input_references: refs } : {})
      }
    });
  } catch (e) {
    if (!(e instanceof AiEngineError) || (e.status !== 404 && e.status !== 405)) throw e;
    return postJson(`${OPENROUTER_API_BASE}/chat/completions`, {
      ...opts,
      body: {
        model,
        modalities: ['image', 'text'],
        messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, ...refs] }],
        image_config: isOpenAiModel ? { aspect_ratio: ASPECT_RATIO } : { aspect_ratio: ASPECT_RATIO, image_size: imageSize }
      }
    });
  }
}

// 2:3 portrait sizes (multiples of 16). Custom sizes need GPT Image 2+.
function openaiSize(model: string, imageSize: string): string {
  return imageSize === '2K' && /^gpt-image-2/.test(model) ? '1344x2016' : '1024x1536';
}

/** OpenAI: /images/edits (multipart image[]) with input_fidelity "high" to keep faces closest to the photo. */
async function openaiGenerate({ apiKey, model, imageSize, prompt, images }: GenerateArgs) {
  const opts = { provider: 'openai' as const, apiKey, timeoutMs: OPENAI_TIMEOUT_MS };
  const params: Record<string, string | number> = {
    model,
    prompt,
    size: openaiSize(model, imageSize),
    quality: 'high',
    output_format: 'jpeg',
    output_compression: 95,
    moderation: 'low',
    n: 1
  };
  if (!images.length) return postJson(`${OPENAI_API_BASE}/images/generations`, { ...opts, body: params });
  const form = new FormData();
  Object.entries({ ...params, input_fidelity: 'high' }).forEach(([k, v]) => form.append(k, String(v)));
  images.forEach((img, i) => {
    const ext = img.mimeType === 'image/png' ? 'png' : img.mimeType === 'image/webp' ? 'webp' : 'jpg';
    form.append('image[]', new Blob([Buffer.from(img.data, 'base64')], { type: img.mimeType }), `ref-${i + 1}.${ext}`);
  });
  return postJson(`${OPENAI_API_BASE}/images/edits`, { ...opts, form });
}

const GENERATORS = { google: googleGenerate, openrouter: openrouterGenerate, openai: openaiGenerate };

export async function generateImage(engine: Engine, prompt: string, images: AiImage[]): Promise<AiImage> {
  const json = await GENERATORS[engine.provider]({ apiKey: engine.apiKey, model: engine.model, imageSize: engine.imageSize, prompt, images });
  // OpenAI returns bare base64 without a MIME type; JPEG was requested
  const openaiImage = engine.provider === 'openai' ? json?.data?.[0]?.b64_json : null;
  if (typeof openaiImage === 'string') return { mimeType: 'image/jpeg', data: openaiImage };
  const image = findOutputImage(json);
  if (!image) {
    const reason = findText(json);
    throw new AiEngineError(`AI ไม่ได้ส่งภาพกลับมา${reason ? `: ${reason}` : ' (อาจถูกระบบความปลอดภัยของผู้ให้บริการปฏิเสธ)'}`, 422, 'SF0001');
  }
  return image;
}

/** Checks a key with a metadata lookup (free, no image is generated). */
export async function testEngine(engine: Engine): Promise<{ displayName: string; balanceUsd: number | null }> {
  const opts = { provider: engine.provider, apiKey: engine.apiKey, timeoutMs: 15_000 };
  const modelLabel = AI_PROVIDERS[engine.provider].models[engine.model] ?? engine.model;
  if (engine.provider === 'openrouter') {
    const key = await requestJson('GET', `${OPENROUTER_API_BASE}/key`, opts);
    let balanceUsd: number | null = null;
    try {
      const credits = await requestJson('GET', `${OPENROUTER_API_BASE}/credits`, opts);
      if (credits?.data) balanceUsd = Number(credits.data.total_credits) - Number(credits.data.total_usage);
    } catch {
      if (key?.data?.limit_remaining != null) balanceUsd = Number(key.data.limit_remaining);
    }
    return { displayName: `OpenRouter • ${modelLabel}`, balanceUsd: Number.isFinite(balanceUsd) ? Math.round((balanceUsd as number) * 100) / 100 : null };
  }
  if (engine.provider === 'openai') {
    // 404 when this account can't use the model (e.g. organization not verified yet)
    await requestJson('GET', `${OPENAI_API_BASE}/models/${encodeURIComponent(engine.model)}`, opts);
    return { displayName: `OpenAI • ${modelLabel}`, balanceUsd: null };
  }
  const json = await requestJson('GET', `${GOOGLE_API_BASE}/models/${encodeURIComponent(engine.model)}`, opts);
  return { displayName: json?.displayName ?? modelLabel, balanceUsd: null };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
