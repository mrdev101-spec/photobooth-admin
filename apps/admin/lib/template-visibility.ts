import { AI_SCENES, BADGE_FRAMES, CLASSIC_TEMPLATES, PHOTO_LAYOUTS } from '@photobooth/catalog';
import { isUploadedTemplateId, type KioskSettings } from '@photobooth/contracts';

/**
 * Which templates a kiosk shows (docs §18.2, §18.6). Owners only switch templates on/off;
 * the platform adds or retires them. In settings, an empty list means "every template",
 * which stays true for templates added later.
 */

export type TemplateKind = 'photo-4x6' | 'badge' | 'classic' | 'ai-scene';

export const TEMPLATE_KINDS: { kind: TemplateKind; label: string; desc: string }[] = [
  { kind: 'photo-4x6', label: 'กรอบภาพ 4x6', desc: 'โหมด Photo 4x6' },
  { kind: 'badge', label: 'กรอบเข็มกลัด', desc: 'โหมด Photo 4x6 (เข็มกลัด)' },
  { kind: 'classic', label: 'Classic Receipt', desc: 'โหมด Classic (ใบเสร็จ)' },
  { kind: 'ai-scene', label: 'ฉาก AI', desc: 'โหมด AI Studio' }
];

export interface CatalogItem {
  kind: TemplateKind;
  id: string;
  name: string;
  desc: string;
  tag?: string;
  /** Card preview: rendered from the kiosk's own drawing code with a sample photo. */
  image?: string;
  /** Extra previews for the detail page (e.g. the AI scene's female / male examples). */
  gallery?: { src: string; label: string }[];
  /** Facts shown on the detail page. */
  facts?: { label: string; value: string }[];
  /** Uploaded by this customer for its own kiosks (absent = the platform's). */
  ownerOrgId?: string;
}

// Generated from the kiosk's data/ai-scenes (rockstar has no sample: the kiosk makes it on demand)
const AI_IMAGES = new Set(['astronaut', 'fantasy', 'hollywood', 'lost-temple', 'neon-city', 'noir', 'racing', 'seoul-romance', 'superhero']);
const AI_MALE = new Set(['astronaut', 'hollywood', 'lost-temple', 'neon-city', 'noir', 'racing', 'seoul-romance', 'superhero']);

const aiGallery = (id: string) =>
  AI_IMAGES.has(id)
    ? [
        { src: `/catalog/ai-scenes/${id}.jpg`, label: 'ฉากต้นแบบ' },
        { src: `/catalog/ai-scenes/${id}-female.jpg`, label: 'ตัวอย่าง (ผู้หญิง)' },
        ...(AI_MALE.has(id) ? [{ src: `/catalog/ai-scenes/${id}-male.jpg`, label: 'ตัวอย่าง (ผู้ชาย)' }] : [])
      ]
    : undefined;

/** Built-in templates (the kiosk draws them in code); uploaded ones join in Phase 7. */
export const BUILTIN_CATALOG: CatalogItem[] = [
  ...PHOTO_LAYOUTS.map((l) => ({
    kind: 'photo-4x6' as const,
    id: l.id,
    name: l.name,
    desc: l.desc,
    tag: l.collection === 'classic' ? (l.shots ? `ชุด Classic • ${l.shots} ช็อต` : 'ชุด Classic') : undefined,
    image: `/catalog/photo-4x6/${l.id}.jpg`,
    facts: [
      { label: 'ขนาดงานพิมพ์', value: '4x6 นิ้ว (1200 x 1800 px)' },
      { label: 'จำนวนช็อต', value: `${l.shots ?? 1} ช็อต` },
      ...(l.collection === 'classic' ? [{ label: 'ชุด', value: 'Classic' }] : [])
    ]
  })),
  ...BADGE_FRAMES.map((f) => ({
    kind: 'badge' as const,
    id: f.id,
    name: f.name,
    desc: f.desc,
    image: `/catalog/badge/${f.id}.jpg`,
    facts: [{ label: 'รูปแบบ', value: 'กรอบเข็มกลัดวงกลม ใช้ได้ทุกขนาดเข็มกลัด' }]
  })),
  ...CLASSIC_TEMPLATES.map((t) => ({
    kind: 'classic' as const,
    id: t.id,
    name: t.name,
    desc: `${t.shots} ช็อต • ราคาเริ่มต้น ฿${t.price}`,
    image: `/catalog/classic/${t.id}.jpg`,
    facts: [
      { label: 'จำนวนช็อต', value: `${t.shots} ช็อต` },
      { label: 'ราคาเริ่มต้นในตู้', value: `฿${t.price}` },
      { label: 'เครื่องพิมพ์', value: 'ใบเสร็จความร้อน 58 / 80 มม. (พิมพ์ขาวดำ)' }
    ]
  })),
  ...AI_SCENES.map((s) => ({
    kind: 'ai-scene' as const,
    id: s.id,
    name: s.name,
    desc: s.desc,
    image: AI_IMAGES.has(s.id) ? `/catalog/ai-scenes/${s.id}-female.jpg` : undefined,
    gallery: aiGallery(s.id),
    facts: [{ label: 'ภาพตัวอย่าง', value: AI_IMAGES.has(s.id) ? 'สร้างจากฉากต้นแบบของตู้' : 'ตู้สร้างภาพตัวอย่างเองเมื่อใช้ครั้งแรก' }]
  }))
];

export type RetiredSet = Partial<Record<TemplateKind, Set<string>>>;

/**
 * The catalog as it is right now: built-ins the platform retired, plus the uploaded templates
 * that are published. Uploaded ids start with `tpl_`.
 */
export interface CatalogState {
  retired: RetiredSet;
  uploaded: CatalogItem[];
}

export const BUILTIN_ONLY: CatalogState = { retired: {}, uploaded: [] };

const listOf = (s: KioskSettings['templates'], kind: TemplateKind): string[] =>
  kind === 'photo-4x6' ? s.photoLayouts : kind === 'badge' ? s.badgeFrames : kind === 'classic' ? s.classic : s.aiScenes;

/** Every template a kiosk could show for a kind: built-ins not retired, then uploaded ones. */
export function catalogItems(kind: TemplateKind, state: CatalogState = BUILTIN_ONLY): CatalogItem[] {
  return [...BUILTIN_CATALOG.filter((c) => c.kind === kind && !state.retired[kind]?.has(c.id)), ...state.uploaded.filter((c) => c.kind === kind)];
}

export function publishedIds(kind: TemplateKind, state: CatalogState = BUILTIN_ONLY): string[] {
  return catalogItems(kind, state).map((c) => c.id);
}

/** Ids the kiosk shows for a kind (resolving "all"), without retired ones. */
export function visibleIds(templates: KioskSettings['templates'], kind: TemplateKind, state: CatalogState = BUILTIN_ONLY): string[] {
  const published = publishedIds(kind, state);
  const list = listOf(templates, kind);
  return list.length ? list.filter((id) => published.includes(id)) : published;
}

/**
 * New templates block with `ids` shown for `kind`. Showing every published template is
 * stored as [] ("all", including future templates). The default must stay visible.
 */
export function withVisible(templates: KioskSettings['templates'], kind: TemplateKind, ids: string[], state: CatalogState = BUILTIN_ONLY): KioskSettings['templates'] {
  const published = publishedIds(kind, state);
  const wanted = published.filter((id) => ids.includes(id));
  if (!wanted.length) throw new Error('ต้องเปิดไว้อย่างน้อย 1 แบบ');
  const list = wanted.length === published.length && !state.retired[kind]?.size ? [] : wanted;
  return setList(templates, kind, list, wanted);
}

function setList(templates: KioskSettings['templates'], kind: TemplateKind, list: string[], shown: string[]): KioskSettings['templates'] {
  const t = { ...templates };
  if (kind === 'photo-4x6') {
    t.photoLayouts = list;
    if (!shown.includes(t.photoDefaultLayout)) t.photoDefaultLayout = shown[0]!;
  } else if (kind === 'badge') {
    t.badgeFrames = list;
    if (!shown.includes(t.badgeDefaultFrame)) t.badgeDefaultFrame = shown[0]!;
  } else if (kind === 'classic') t.classic = list;
  else t.aiScenes = list;
  return t;
}

/**
 * What a kiosk receives. Retired templates are removed (a kind with retired templates is sent
 * as an explicit list, because the kiosk reads [] as "all built-ins"). A kiosk that has never
 * fetched the asset manifest cannot draw uploaded templates, so their ids are left out too.
 */
export function forKiosk(settings: KioskSettings, state: CatalogState, opts: { supportsUploaded: boolean }): KioskSettings {
  const effective: CatalogState = opts.supportsUploaded ? state : { ...state, uploaded: [] };
  let templates = settings.templates;
  for (const { kind } of TEMPLATE_KINDS) {
    const list = listOf(templates, kind);
    const hasUnsupported = !opts.supportsUploaded && (list.some(isUploadedTemplateId) || isUploadedTemplateId(defaultOf(templates, kind) ?? ''));
    if (!effective.retired[kind]?.size && !hasUnsupported) continue;
    const ids = visibleIds(templates, kind, effective);
    const shown = ids.length ? ids : publishedIds(kind, effective).slice(0, 1);
    templates = setList(templates, kind, effective.retired[kind]?.size || shown.length !== publishedIds(kind, effective).length ? shown : [], shown);
  }
  return templates === settings.templates ? settings : { ...settings, templates };
}

const defaultOf = (t: KioskSettings['templates'], kind: TemplateKind) => (kind === 'photo-4x6' ? t.photoDefaultLayout : kind === 'badge' ? t.badgeDefaultFrame : null);
