'use client';

import { useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useMemo, useState, useTransition, type ReactNode } from 'react';
import clsx from 'clsx';
import { Check, ChevronLeft, ChevronRight, Search, X, Layers, Link2, Lock, BadgeCheck, Download, Frame, Hand, IdCard, LayoutGrid, Music, Palette, Printer, QrCode, ReceiptText, Ruler, ShoppingBag, Smartphone, Sparkles, Timer, Type } from 'lucide-react';
import { DecorTextEditor } from '@/components/decor-text-editor';
import { SheetLayoutEditor } from '@/components/sheet-layout-editor';
import {
  AI_SCENES,
  APP_MODES,
  BADGE_FRAMES,
  BADGE_SIZES,
  CLASSIC_TEMPLATES,
  EVENT_PRESETS,
  PHOTO_LAYOUTS
} from '@photobooth/catalog';
import type { KioskSettings } from '@photobooth/contracts';
import { buttonClass } from '@/components/ui';
import { saveConfigAction, type SaveConfigResult } from './actions';
import { CONFIG_SECTIONS, DEFAULT_CONFIG_PERMISSIONS, type ConfigPermissions, type ConfigSectionId, type PermissionLevel } from '@/lib/config-permissions';
import { ALWAYS_OWN, normalizeOwnSections } from '@/lib/config-layers';
import { diffSettings } from '@/lib/settings-diff';

export type EditableSettings = Omit<KioskSettings, 'adminPin'>;
type PinChange = { action: 'keep' } | { action: 'clear' } | { action: 'set'; pin: string };

/** A settings layer a kiosk can follow (ค่ากลาง or an event); `id` null = ค่ากลาง. */
export interface EditorSource {
  id: string | null;
  label: string;
  settings: EditableSettings;
  hasPin: boolean;
}

/** What the editor sends; kiosks use baseRevision + layers, presets use baseUpdatedAt. */
export interface ConfigSavePayload {
  baseRevision: number;
  baseUpdatedAt: string | null;
  settings: EditableSettings;
  pin: PinChange;
  note: string;
  eventId?: string | null;
  ownSections?: string[];
}

interface Props {
  orgSlug: string;
  kioskRowId: string;
  baseRevision: number;
  initial: EditableSettings;
  hasPin: boolean;
  canEdit: boolean;
  livePaymentsAllowed: boolean;
  storageConfigured: boolean;
  /** What this customer may change (docs §17.4); ignored for the platform team. */
  permissions?: ConfigPermissions;
  isPlatform?: boolean;
  /** Templates that can be shown right now (built-in not retired + published uploaded). */
  catalog?: EditorCatalog;
  /** 'preset' = ค่ากลาง / an event: no identity section, no layers. */
  scope?: 'kiosk' | 'preset';
  /** Presets: the updatedAt the page loaded (conflict check). */
  baseUpdatedAt?: string | null;
  /** Presets: their own save action (kiosks use saveConfigAction). */
  saveAction?: (payload: ConfigSavePayload) => Promise<SaveConfigResult>;
  /** Kiosks: the layers it can follow, the one it follows and the sections it sets itself. */
  sources?: EditorSource[];
  initialEventId?: string | null;
  initialOwn?: string[] | null;
  /** ค่ากลาง / งาน: kiosks of this layer that set a section themselves (section id → names). */
  layerOwners?: Record<string, string[]>;
  /** ค่ากลาง / งาน: make those kiosks follow this layer again for one section. */
  followAction?: (section: string) => Promise<{ ok: boolean; message: string }>;
  /** 'wizard' = new-event setup step by step (presets only); default = summary cards + side panel. */
  variant?: 'cards' | 'wizard';
  /** Wizard: settings to start from ("copy from an earlier event"). */
  copySources?: { id: string; label: string; settings: EditableSettings }[];
  /** Wizard: where to go once saved. */
  doneHref?: string;
}

type CatalogEntry = { id: string; name: string; desc?: string; image?: string };
export interface EditorCatalog {
  photo: CatalogEntry[];
  badge: CatalogEntry[];
  classic: CatalogEntry[];
  ai: CatalogEntry[];
}
const BUILTIN_EDITOR_CATALOG: EditorCatalog = {
  photo: PHOTO_LAYOUTS.map((t) => ({ ...t, image: `/catalog/photo-4x6/${t.id}.jpg` })),
  badge: BADGE_FRAMES.map((t) => ({ ...t, image: `/catalog/badge/${t.id}.jpg` })),
  classic: [...CLASSIC_TEMPLATES],
  ai: [...AI_SCENES]
};

// ─── permissions: locked parts are read-only (with a lock badge), hidden parts are not shown ──
const LevelContext = createContext<(id: ConfigSectionId) => PermissionLevel>(() => 'edit');
/** Sections that follow ค่ากลาง / an event: the label of that layer, or null when the kiosk sets them. */
const InheritContext = createContext<(id: ConfigSectionId) => string | null>(() => null);
/** Inherited sections: unlock one for this kiosk, or go to the page that sets it. */
/** ค่ากลาง / งาน: who keeps its own value of a section (they won't change with this page). */
const LayerOwners = createContext<{ owners: Record<string, string[]>; follow: ((section: string) => Promise<{ ok: boolean; message: string }>) | null; canFollow: boolean } | null>(null);

function OwnersNote({ perm }: { perm: ConfigSectionId }) {
  const ctx = useContext(LayerOwners);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const names = ctx?.owners[perm] ?? [];
  if (!ctx || (!names.length && !msg)) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-warning-200 bg-warning-50 px-5 py-2 text-sm text-warning-800">
      {names.length ? (
        <>
          <span className="min-w-0 flex-1">
            <b>{names.length} ตู้ตั้งหมวดนี้เอง</b> ({names.join(', ')}) จะไม่เปลี่ยนตามค่าในหน้านี้
          </span>
          {ctx.follow && ctx.canFollow ? (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await ctx.follow!(perm);
                  setMsg(r);
                  if (r.ok) router.refresh();
                })
              }
              className="rounded-full border border-warning-300 bg-surface px-3 py-1 text-xs font-medium text-warning-800 hover:bg-warning-100"
            >
              {pending ? 'กำลังส่ง…' : 'ให้ตู้เหล่านี้ใช้ค่านี้'}
            </button>
          ) : null}
        </>
      ) : null}
      {msg ? <span className={msg.ok ? 'text-success-700' : 'text-danger-600'}>{msg.message}</span> : null}
    </div>
  );
}

const InheritActions = createContext<{ own: (id: ConfigSectionId) => void; sourceHref: string | null; canFlip: (id: ConfigSectionId) => boolean } | null>(null);

function InheritBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-medium text-primary-700 ring-1 ring-primary-200 ring-inset">
      <Link2 className="size-3" aria-hidden />
      ตาม{label}
    </span>
  );
}

function LockBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-ink-100 px-2.5 py-0.5 text-xs font-medium text-ink-600 ring-1 ring-ink-200 ring-inset">
      <Lock className="size-3" aria-hidden />
      จัดการโดยผู้ให้บริการ
    </span>
  );
}

/** Wraps part of a section that belongs to another permission section. */
function Gate({ id, children }: { id: ConfigSectionId; children: ReactNode }) {
  const level = useContext(LevelContext)(id);
  const inherited = useContext(InheritContext)(id);
  const actions = useContext(InheritActions);
  if (level === 'hidden') return null;
  if (level === 'edit') return <>{children}</>;
  return (
    <>
      {inherited ? (
        <p className="flex flex-wrap items-center gap-2 text-xs text-ink-500 sm:col-span-2">
          <InheritBadge label={inherited} />
          {actions?.canFlip(id) ? (
            <button type="button" onClick={() => actions.own(id)} className="rounded-full border border-primary-300 bg-surface px-2.5 py-0.5 font-medium text-primary-700 hover:bg-primary-50">
              ตั้งเฉพาะตู้นี้
            </button>
          ) : null}
        </p>
      ) : null}
      <fieldset disabled className="contents" aria-label={inherited ? `ตาม${inherited}` : 'จัดการโดยผู้ให้บริการ'}>
        {children}
      </fieldset>
    </>
  );
}

// ─── layout: tabs of groups, collapsible sections with a one-line summary ───
const GROUPS = [
  { id: 'event', label: 'หน้างานและแบรนด์' },
  { id: 'sales', label: 'สินค้าและราคา' },
  { id: 'frames', label: 'กรอบภาพ' },
  { id: 'output', label: 'พิมพ์และรับภาพ' },
  { id: 'system', label: 'ระบบตู้' }
] as const;
type GroupId = (typeof GROUPS)[number]['id'];

/** Each section (by title): its tab, the settings paths it edits (changes / errors) and search words. */
const SECTION_META: Record<string, { group: GroupId; paths: string[]; keywords?: string; modes?: string[]; kioskOnly?: boolean }> = {
  'โหมดตู้': { group: 'event', paths: ['appMode'], keywords: 'classic ai photo จุดรับรูป' },
  'แบรนด์และธีมงาน': { group: 'event', paths: ['brand', 'event', 'attract'], keywords: 'ชื่องาน สี วันที่ ธีม แบรนด์ หัวข้อ' },
  'ข้อความตกแต่ง': { group: 'event', paths: ['decor'], keywords: 'ฟอนต์ ข้อความ กรอบ', modes: ['photo'] },
  'เสียงและเพลง': { group: 'event', paths: ['sound'], keywords: 'เสียง เพลง ความดัง', modes: ['photo'] },
  'สินค้าและราคา (Photo 4x6)': { group: 'sales', paths: ['products.photo', 'products.badge', 'products.bundle', 'photoFulfillment'], keywords: 'ราคา ภาพ เข็มกลัด จุดรับรูป', modes: ['photo'] },
  'ราคา Classic Receipt': { group: 'sales', paths: ['products.classic', 'templates.classic'], keywords: 'ราคา ใบเสร็จ แบบ', modes: ['classic'] },
  'AI Studio': { group: 'sales', paths: ['products.ai', 'ai', 'templates.aiScenes'], keywords: 'ราคา ฉาก สาธิต', modes: ['ai'] },
  'การรับเงิน': { group: 'sales', paths: ['payment'], keywords: 'จ่าย promptpay stripe ฟรี ราคา เงิน' },
  'กรอบภาพ 4x6': { group: 'frames', paths: ['templates.photoLayouts', 'templates.photoDefaultLayout'], keywords: 'template กรอบ', modes: ['photo'] },
  'เข็มกลัด': { group: 'frames', paths: ['badge', 'templates.badgeFrames', 'templates.badgeDefaultFrame'], keywords: 'ขนาด กรอบ template', modes: ['photo'] },
  'การพิมพ์': { group: 'output', paths: ['print'], keywords: 'ใบคิว คิว เครื่องพิมพ์' },
  'กระดาษ': { group: 'output', paths: ['paper'], keywords: 'a4 a5 4x6 layout แผ่น เครื่องพิมพ์ 58 80', modes: ['photo', 'pickup', 'classic', 'ai'] },
  'ดาวน์โหลดภาพ (QR)': { group: 'output', paths: ['share'], keywords: 'qr ดาวน์โหลด r2' },
  'รูปจากมือถือ': { group: 'output', paths: ['phoneUpload'], keywords: 'qr มือถือ อัปโหลด', modes: ['photo', 'classic'] },
  'ชูมือเริ่มถ่าย': { group: 'output', paths: ['gesture'], keywords: 'มือ ฝ่ามือ gesture ท่าทาง เริ่มถ่าย hand palm' },
  'ภาพเคลื่อนไหว (ดุ๊กดิ๊ก)': { group: 'output', paths: ['motion'], keywords: 'ดุ๊กดิ๊ก gif ถ่ายรัว เคลื่อนไหว boomerang', modes: ['photo', 'classic'] },
  'ตัวตนตู้': { group: 'system', paths: ['identity'], keywords: 'ชื่อตู้ สถานที่', kioskOnly: true },
  'พฤติกรรมตู้': { group: 'system', paths: ['idleReturnSec', '$pin'], keywords: 'pin รหัส หน้าแรก เวลา' }
};

interface EditorView {
  variant: 'cards' | 'wizard';
  query: string;
  /** Cards: the section open in the side panel. */
  active: string | null;
  setActive: (title: string | null) => void;
  /** Wizard: the sections of the current step. */
  stepTitles: string[];
  summary: (title: string) => string;
  changed: (paths: string[]) => boolean;
  failed: (paths: string[]) => boolean;
  /** The kiosk preview beside sections people can see on the kiosk (brand, frames, decor). */
  preview: (title: string) => ReactNode;
}
const ViewContext = createContext<EditorView | null>(null);

const META_ORDER = Object.keys(SECTION_META);
const orderOf = (title: string) => {
  const m = SECTION_META[title];
  return m ? GROUPS.findIndex((g) => g.id === m.group) * 100 + META_ORDER.indexOf(title) + 1 : 0;
};

/** Steps of the new-event wizard (sections by title; the last step reviews and saves). */
const WIZARD_STEPS: { label: string; intro: string; titles: string[]; preview?: boolean }[] = [
  { label: 'โหมดตู้', intro: 'ตู้ในงานนี้ใช้โหมดไหน', titles: ['โหมดตู้'] },
  { label: 'ชื่องานและแบรนด์', intro: 'ชื่องาน วันที่ และสีที่ลูกค้าเห็นบนจอและบนภาพ', titles: ['แบรนด์และธีมงาน'], preview: true },
  { label: 'สินค้าและราคา', intro: 'ขายอะไรบ้าง ราคาเท่าไร และเก็บเงินอย่างไร', titles: ['สินค้าและราคา (Photo 4x6)', 'ราคา Classic Receipt', 'AI Studio', 'การรับเงิน'] },
  { label: 'กรอบภาพ', intro: 'กรอบที่ลูกค้าเลือกได้ในงานนี้', titles: ['กรอบภาพ 4x6', 'เข็มกลัด'], preview: true },
  { label: 'พิมพ์และรับภาพ', intro: 'พิมพ์ที่ตู้ หรือให้ลูกค้ารับภาพทาง QR', titles: ['การพิมพ์', 'กระดาษ', 'ดาวน์โหลดภาพ (QR)', 'รูปจากมือถือ'] },
  { label: 'ตรวจสอบ', intro: 'ตรวจทุกอย่างก่อนบันทึก แก้ได้อีกเสมอที่หน้างาน', titles: [] }
];

/** Section edit panel (cards layout): slides in from the right; the preview sits beside the fields. */
function Drawer({ title, hint, icon, badges, preview, onClose, children }: { title: string; hint?: string; icon?: ReactNode; badges?: ReactNode; preview?: ReactNode; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="ปิด" onClick={onClose} className="absolute inset-0 cursor-default bg-ink-900/30" />
      <div className={clsx('relative flex h-full w-full flex-col bg-canvas shadow-2xl', preview ? 'max-w-6xl' : 'max-w-2xl')}>
        <header className="flex items-start gap-3 border-b border-ink-200 bg-surface px-6 py-4">
          {icon ? <span className="mt-1 text-primary-600 [&>svg]:size-5">{icon}</span> : null}
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold text-ink-900">{title}</h2>
            {hint ? <p className="mt-0.5 text-sm text-ink-500">{hint}</p> : null}
            {badges ? <div className="mt-2 flex flex-wrap items-center gap-2">{badges}</div> : null}
          </div>
          <button type="button" onClick={onClose} aria-label="ปิด" className={buttonClass('ghost', 'icon')}>
            <X aria-hidden />
          </button>
        </header>
        <div className="flex min-h-0 flex-1">
          <div className="min-w-0 flex-1 overflow-y-auto">{children}</div>
          {preview ? <aside aria-label="ตัวอย่างที่ตู้" className="hidden w-[380px] shrink-0 overflow-y-auto bg-ink-900 p-6 lg:block">{preview}</aside> : null}
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-200 bg-surface px-6 py-3">
          <span className="text-sm text-ink-500">ค่าที่แก้จะส่งไปตู้เมื่อกด &quot;บันทึกและส่งไปตู้&quot; ด้านล่าง</span>
          <button type="button" onClick={onClose} className={buttonClass()}>
            <Check className="size-4" aria-hidden />
            เสร็จ
          </button>
        </footer>
      </div>
    </div>
  );
}

/** Roughly what the kiosk shows with these settings (brand, event text, colour, default frames). */
function KioskPreview({ s, catalog }: { s: EditableSettings; catalog: EditorCatalog }) {
  const [view, setView] = useState<'attract' | 'photo' | 'badge'>('attract');
  const accent = /^#[0-9a-fA-F]{6}$/.test(s.event.accent) ? s.event.accent : '#c94a0a';
  const photo = catalog.photo.find((l) => l.id === s.templates.photoDefaultLayout)?.image ?? catalog.photo[0]?.image;
  const badge = catalog.badge.find((f) => f.id === s.templates.badgeDefaultFrame)?.image ?? catalog.badge[0]?.image;
  const title = s.event.title || s.brand.photoTitle || 'ชื่องาน';
  const sub = s.event.subtitle || s.brand.photoTagline;
  const date = s.event.date || new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
  return (
    <div className="flex flex-col items-center gap-4">
      <div role="tablist" aria-label="ตัวอย่างหน้าจอ" className="flex gap-1 rounded-full bg-ink-800 p-1 text-sm">
        {(
          [
            ['attract', 'หน้าแรก'],
            ['photo', 'ภาพ 4x6'],
            ['badge', 'เข็มกลัด']
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={view === id} onClick={() => setView(id)} className={clsx('rounded-full px-3 py-1.5', view === id ? 'bg-surface font-semibold text-ink-900' : 'text-ink-300 hover:text-white')}>
            {label}
          </button>
        ))}
      </div>
      <div className="flex aspect-[9/16] w-full max-w-[300px] flex-col items-center gap-3 overflow-hidden rounded-[26px] border-8 border-ink-950 bg-white px-5 py-7 text-center" style={{ backgroundImage: `linear-gradient(${accent}14, ${accent}14)` }}>
        {view === 'attract' ? (
          <>
            {s.brand.brandName ? <div className="text-xs font-semibold tracking-[0.2em]" style={{ color: accent }}>{s.brand.brandName.toUpperCase()}</div> : null}
            <div className="text-2xl leading-tight font-bold text-ink-900">{title}</div>
            {sub ? <div className="text-sm text-ink-600">{sub}</div> : null}
            <div className="text-xs text-ink-500">{date}</div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {photo ? <img src={photo} alt="" className="mt-1 w-[58%] -rotate-3 rounded shadow-lg" /> : null}
            <div className="mt-auto rounded-full px-6 py-2.5 text-sm font-semibold text-white" style={{ backgroundColor: accent }}>
              แตะเพื่อเริ่ม
            </div>
          </>
        ) : view === 'photo' ? (
          // eslint-disable-next-line @next/next/no-img-element
          photo ? <img src={photo} alt="กรอบเริ่มต้น" className="my-auto w-full rounded shadow-lg" /> : <p className="my-auto text-sm text-ink-500">ยังไม่มีกรอบ</p>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          badge ? <img src={badge} alt="กรอบเข็มกลัดเริ่มต้น" className="my-auto w-[80%] rounded-full shadow-lg" /> : <p className="my-auto text-sm text-ink-500">ยังไม่มีกรอบ</p>
        )}
      </div>
      <p className="text-center text-xs text-ink-400">ตัวอย่างโดยประมาณ • ภาพกรอบเป็นตัวอย่างของแบบนั้น ที่ตู้จะใส่ชื่องานและภาพลูกค้าจริง</p>
    </div>
  );
}

function Section({ title, hint, icon, children, dim, perm }: { title: string; hint?: string; icon?: ReactNode; children: ReactNode; dim?: boolean; perm?: ConfigSectionId }) {
  const level = useContext(LevelContext)(perm ?? 'identity');
  const inherited = useContext(InheritContext)(perm ?? 'identity');
  const actions = useContext(InheritActions);
  const view = useContext(ViewContext);
  if (perm && level === 'hidden') return null;
  const locked = !!perm && level === 'view';
  const meta = SECTION_META[title];
  const summary = view?.summary(title) ?? '';
  const q = view?.query.trim().toLowerCase() ?? '';
  if (view && meta) {
    if (view.variant === 'wizard' ? !view.stepTitles.includes(title) : q && !`${title} ${hint ?? ''} ${meta.keywords ?? ''} ${summary}`.toLowerCase().includes(q)) return null;
  }
  const changed = !!(view && meta && view.changed(meta.paths));
  const failed = !!(view && meta && view.failed(meta.paths));

  const badges =
    perm && inherited ? (
      <span className="flex flex-wrap items-center gap-2">
        <InheritBadge label={inherited} />
        {actions?.canFlip(perm) ? (
          <button type="button" onClick={() => actions.own(perm)} className="rounded-full border border-primary-300 bg-surface px-2.5 py-0.5 text-xs font-medium text-primary-700 hover:bg-primary-50">
            ตั้งเฉพาะตู้นี้
          </button>
        ) : null}
        {actions?.sourceHref ? (
          <a href={actions.sourceHref} className="text-xs font-medium text-ink-600 underline hover:text-ink-900">
            แก้ที่{inherited}
          </a>
        ) : null}
      </span>
    ) : locked ? (
      <LockBadge />
    ) : null;
  const body = (
    <>
      {perm ? <OwnersNote perm={perm} /> : null}
      <fieldset disabled={locked} className="grid gap-5 p-5 sm:grid-cols-2">
        {children}
      </fieldset>
    </>
  );

  // Cards: a summary card; the section itself opens in the side panel
  if (view && meta && view.variant === 'cards') {
    return (
      <>
        <button
          type="button"
          onClick={() => view.setActive(title)}
          style={{ order: orderOf(title) }}
          className={clsx(
            'flex min-w-0 flex-col gap-1.5 rounded-card border bg-surface p-4 text-left shadow-card transition-colors hover:border-primary-400',
            failed ? 'border-danger-300' : changed ? 'border-primary-400 ring-1 ring-primary-200' : 'border-ink-200',
            dim && 'opacity-60'
          )}
        >
          <span className="flex items-center gap-2">
            {icon ? <span className="text-primary-600 [&>svg]:size-[18px]">{icon}</span> : null}
            <span className="min-w-0 flex-1 text-base font-semibold text-ink-900">{title}</span>
            {failed ? (
              <span className="rounded-full bg-danger-50 px-2 py-0.5 text-xs font-medium text-danger-700">ต้องแก้</span>
            ) : changed ? (
              <span className="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700">แก้แล้ว</span>
            ) : inherited ? (
              <span className="rounded-full bg-primary-50 px-2 py-0.5 text-xs whitespace-nowrap text-primary-700">ตาม{inherited}</span>
            ) : locked ? (
              <Lock className="size-3.5 text-ink-400" aria-label="จัดการโดยผู้ให้บริการ" />
            ) : null}
          </span>
          <span className="line-clamp-2 text-sm text-ink-600">{summary || hint}</span>
        </button>
        {view.active === title ? (
          <Drawer title={title} hint={hint} icon={icon} badges={badges} preview={view.preview(title)} onClose={() => view.setActive(null)}>
            {body}
          </Drawer>
        ) : null}
      </>
    );
  }

  // Wizard step, or no layout context: the whole section
  return (
    <section id={`sec-${title}`} className={clsx('overflow-hidden rounded-card border bg-surface shadow-card', failed ? 'border-danger-300' : 'border-ink-200', dim && 'opacity-60')}>
      <header className="flex items-start gap-3 border-b border-ink-100 px-5 py-3">
        {icon ? <span className="mt-0.5 text-primary-600 [&>svg]:size-5">{icon}</span> : null}
        <div className="min-w-0 flex-1">
          <h2 className="text-lg leading-tight font-semibold text-ink-900">{title}</h2>
          {hint ? <p className="mt-0.5 text-sm text-ink-500">{hint}</p> : null}
        </div>
        {badges}
      </header>
      {body}
    </section>
  );
}

const getIn = (obj: unknown, path: string): unknown => path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj);

// ─── small immutable path setter ────────────────────────────────────────────
function setIn<T>(obj: T, path: string, value: unknown): T {
  const [head, ...rest] = path.split('.');
  const src = obj as Record<string, unknown>;
  return { ...src, [head!]: rest.length ? setIn(src[head!], rest.join('.'), value) : value } as T;
}

function Err({ msg }: { msg?: string }) {
  return msg ? <p className="text-sm text-danger-600">{msg}</p> : null;
}

const inputCls = (bad?: boolean) =>
  clsx(
    'h-11 w-full rounded-lg border bg-surface px-3 text-ink-900 transition-colors focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:bg-ink-50 disabled:text-ink-500',
    bad ? 'border-danger-600' : 'border-ink-300'
  );

function Text({ label, value, onChange, error, disabled, maxLength, hint, type = 'text', wide }: { label: string; value: string; onChange: (v: string) => void; error?: string; disabled?: boolean; maxLength?: number; hint?: string; type?: string; wide?: boolean }) {
  return (
    <label className={clsx('flex flex-col gap-1.5', wide && 'sm:col-span-2')}>
      <span className="text-sm font-medium text-ink-700">{label}</span>
      <input type={type} className={inputCls(!!error)} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} maxLength={maxLength} aria-invalid={!!error || undefined} />
      {error ? <Err msg={error} /> : hint ? <span className="text-sm text-ink-500">{hint}</span> : null}
    </label>
  );
}

function Num({ label, value, onChange, error, disabled, min, max, suffix, hint }: { label: string; value: number; onChange: (v: number) => void; error?: string; disabled?: boolean; min?: number; max?: number; suffix?: string; hint?: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-ink-700">{label}</span>
      <span className="flex items-center gap-2">
        <input
          type="number"
          inputMode="numeric"
          className={inputCls(!!error)}
          value={Number.isFinite(value) ? value : ''}
          onChange={(e) => onChange(e.target.value === '' ? Number.NaN : Number(e.target.value))}
          disabled={disabled}
          min={min}
          max={max}
          aria-invalid={!!error || undefined}
        />
        {suffix ? <span className="text-sm whitespace-nowrap text-ink-500">{suffix}</span> : null}
      </span>
      {error ? <Err msg={error} /> : hint ? <span className="text-sm text-ink-500">{hint}</span> : null}
    </label>
  );
}

function Toggle({ label, checked, onChange, disabled, hint, error }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; hint?: string; error?: string }) {
  return (
    <label className={clsx('flex items-start gap-3', disabled && 'opacity-60')}>
      <input type="checkbox" className="mt-0.5 size-5 shrink-0" checked={checked} onChange={(e) => onChange(e.target.checked)} disabled={disabled} />
      <span>
        <span className="font-medium">{label}</span>
        {hint ? <span className="block text-sm text-ink-500">{hint}</span> : null}
        <Err msg={error} />
      </span>
    </label>
  );
}

function Choice<T extends string>({ label, value, options, onChange, disabled, error }: { label: string; value: T; options: readonly { id: T; name: string }[]; onChange: (v: T) => void; disabled?: boolean; error?: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-ink-700">{label}</span>
      <select className={inputCls(!!error)} value={value} onChange={(e) => onChange(e.target.value as T)} disabled={disabled}>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      <Err msg={error} />
    </label>
  );
}

/** [] means "all" (the kiosk offers every built-in); otherwise the explicit list. */
function PickList({ label, all, value, onChange, disabled, error }: { label: string; all: readonly { id: string; name: string; desc?: string }[]; value: string[]; onChange: (v: string[]) => void; disabled?: boolean; error?: string }) {
  const everything = value.length === 0;
  return (
    <fieldset className="flex flex-col gap-2 sm:col-span-2" disabled={disabled}>
      <legend className="mb-1 text-sm font-medium text-ink-700">{label}</legend>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="radio" checked={everything} onChange={() => onChange([])} /> ทุกแบบ (รวมแบบใหม่ในอนาคต)
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" checked={!everything} onChange={() => onChange(all.map((a) => a.id))} /> เลือกเอง
        </label>
      </div>
      {!everything ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {all.map((a) => {
            const on = value.includes(a.id);
            return (
              <label key={a.id} className={clsx('flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-sm', on ? 'border-primary-600 bg-ink-50' : 'border-ink-200')}>
                <input type="checkbox" className="mt-0.5 size-4" checked={on} onChange={(e) => onChange(e.target.checked ? all.filter((x) => x.id === a.id || value.includes(x.id)).map((x) => x.id) : value.filter((v) => v !== a.id))} />
                <span>
                  <span className="font-medium">{a.name}</span>
                  {a.desc ? <span className="block text-xs text-ink-500">{a.desc}</span> : null}
                </span>
              </label>
            );
          })}
        </div>
      ) : null}
      <Err msg={error} />
    </fieldset>
  );
}

// ─── editor ─────────────────────────────────────────────────────────────────
export function ConfigEditor({
  orgSlug,
  kioskRowId,
  baseRevision,
  initial,
  hasPin,
  canEdit,
  livePaymentsAllowed,
  storageConfigured,
  permissions = DEFAULT_CONFIG_PERMISSIONS,
  isPlatform = false,
  catalog = BUILTIN_EDITOR_CATALOG,
  scope = 'kiosk',
  baseUpdatedAt = null,
  saveAction,
  sources = [],
  initialEventId = null,
  initialOwn = null,
  layerOwners,
  followAction,
  variant = 'cards',
  copySources = [],
  doneHref
}: Props) {
  const router = useRouter();
  const [s, setS] = useState<EditableSettings>(initial);
  // Layers (kiosks only): which ค่ากลาง / event it follows and the sections it sets itself
  const layered = scope === 'kiosk' && sources.length > 0;
  const [eventId, setEventId] = useState<string | null>(initialEventId);
  const [own, setOwn] = useState<string[]>(() => normalizeOwnSections(initialOwn));
  const source = sources.find((x) => x.id === eventId) ?? sources[0];
  const inheritedOf = (id: ConfigSectionId): string | null => (layered && source && !own.includes(id) ? source.label : null);
  const levelOf = (id: ConfigSectionId): PermissionLevel => (inheritedOf(id) ? 'view' : isPlatform ? 'edit' : permissions[id]);
  // The last saved state: baseline for "dirty", target of "cancel", base of the next save
  const [saved, setSaved] = useState<{ settings: EditableSettings; revision: number; hasPin: boolean; base: string | null; eventId: string | null; own: string[] }>({
    settings: initial,
    revision: baseRevision,
    hasPin,
    base: baseUpdatedAt,
    eventId: initialEventId,
    own: normalizeOwnSections(initialOwn)
  });
  const [pin, setPin] = useState<PinChange>({ action: 'keep' });
  const [note, setNote] = useState('');
  // ค่ากลาง / งาน serve kiosks of every mode: show every mode's settings there by default
  const wizard = variant === 'wizard';
  // ค่ากลาง / งาน serve kiosks of every mode: every mode's settings there (the wizard: the mode picked)
  const [showAll, setShowAll] = useState(scope === 'preset' && !wizard);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [reviewing, setReviewing] = useState(false);
  const [result, setResult] = useState<SaveConfigResult | null>(null);
  const [pending, start] = useTransition();
  const dirty = useMemo(
    () => JSON.stringify(s) !== JSON.stringify(saved.settings) || pin.action !== 'keep' || eventId !== saved.eventId || JSON.stringify(own) !== JSON.stringify(saved.own),
    [s, saved, pin, eventId, own]
  );

  /** `prev` with the given sections' values taken from a layer. */
  const fromSource = (prev: EditableSettings, ids: readonly string[], src: EditorSource | undefined) => {
    if (!src) return prev;
    let next = prev;
    for (const sec of CONFIG_SECTIONS) {
      if (!ids.includes(sec.id)) continue;
      for (const path of sec.paths) next = setIn(next, path, structuredClone((src.settings as Record<string, unknown>)[path]));
    }
    return next;
  };
  const toggleOwn = (id: ConfigSectionId, mine: boolean) => {
    setOwn((prev) => normalizeOwnSections(mine ? [...prev, id] : prev.filter((x) => x !== id)));
    // Back to inherited: show the layer's values right away
    if (!mine) setS((prev) => fromSource(prev, [id], source));
  };
  const pickSource = (id: string | null) => {
    setEventId(id);
    const next = sources.find((x) => x.id === id) ?? sources[0];
    setS((prev) => fromSource(prev, CONFIG_SECTIONS.map((x) => x.id).filter((x) => !own.includes(x)), next));
  };
  const e = result?.fieldErrors ?? {};
  const err = (path: string) => e[path] ?? e[`settings.${path}`];
  const set = (path: string) => (v: unknown) => setS((prev) => setIn(prev, path, v));
  const ro = !canEdit;

  const mode = s.appMode;
  const show = (...modes: string[]) => showAll || modes.includes(mode);

  const layoutOptions = s.templates.photoLayouts.length ? catalog.photo.filter((l) => s.templates.photoLayouts.includes(l.id)) : catalog.photo;
  const frameOptions = s.templates.badgeFrames.length ? catalog.badge.filter((f) => s.templates.badgeFrames.includes(f.id)) : catalog.badge;

  const applyPreset = () => {
    const p = EVENT_PRESETS.find((x) => x.id === s.event.preset);
    if (!p) return;
    setS((prev) => {
      let next = setIn(prev, 'event.title', p.title);
      next = setIn(next, 'event.subtitle', p.subtitle);
      next = setIn(next, 'event.accent', p.accent);
      if (levelOf('templates') === 'edit') {
        next = setIn(next, 'templates.photoLayouts', p.layouts);
        if (p.layouts.length && !p.layouts.includes(next.templates.photoDefaultLayout)) next = setIn(next, 'templates.photoDefaultLayout', p.layouts[0]);
      }
      return next;
    });
  };

  const save = () =>
    start(async () => {
      const payload: ConfigSavePayload = { baseRevision: saved.revision, baseUpdatedAt: saved.base, settings: s, pin, note, ...(layered ? { eventId, ownSections: own } : {}) };
      const r = saveAction ? await saveAction(payload) : await saveConfigAction(orgSlug, kioskRowId, payload);
      setResult(r);
      if (r.ok) {
        setSaved({
          settings: s,
          revision: r.revision ?? saved.revision,
          hasPin: pin.action === 'set' ? true : pin.action === 'clear' ? false : saved.hasPin,
          base: r.updatedAt ?? saved.base,
          eventId,
          own
        });
        setPin({ action: 'keep' });
        setNote('');
        router.refresh();
      }
    });

  const errorCount = Object.keys(e).length;

  // Which sections / tabs have unsaved changes or errors
  const changedPaths = (paths: string[]) =>
    paths.some((path) => (path === '$pin' ? pin.action !== 'keep' : JSON.stringify(getIn(s, path)) !== JSON.stringify(getIn(saved.settings, path))));
  const failedPaths = (paths: string[]) => Object.keys(e).some((k) => paths.some((path) => { const key = k.replace(/^settings\./, ''); return path === '$pin' ? key.startsWith('pin') : key === path || key.startsWith(`${path}.`); }));
  const groupStats = (g: GroupId) => {
    const metas = Object.entries(SECTION_META).filter(([, m]) => m.group === g);
    return { changed: metas.filter(([, m]) => changedPaths(m.paths)).length, failed: metas.filter(([, m]) => failedPaths(m.paths)).length };
  };
  const onOff = (b: boolean) => (b ? 'เปิด' : 'ปิด');
  const nameOf = (list: readonly { id: string; name: string }[], id: string) => list.find((x) => x.id === id)?.name ?? id;
  const countOf = (list: string[], all: string) => (list.length ? `${list.length} แบบ` : all);
  const summaries: Record<string, () => string> = {
    'โหมดตู้': () => nameOf(APP_MODES, s.appMode),
    'ตัวตนตู้': () => [s.identity.name, s.identity.location].filter(Boolean).join(' • ') || '—',
    'สินค้าและราคา (Photo 4x6)': () =>
      [s.products.photo.sell && `ภาพ ฿${s.products.photo.price}`, s.products.badge.sell && `เข็มกลัด ฿${s.products.badge.price}`, s.products.bundle.sell && `ภาพ+เข็มกลัด ฿${s.products.bundle.price}`, s.photoFulfillment === 'pickup' ? 'รับที่จุดรับรูป' : 'พิมพ์ที่ตู้']
        .filter(Boolean)
        .join(' • '),
    'ราคา Classic Receipt': () => `${CLASSIC_TEMPLATES.map((t) => `${t.name} ฿${s.products.classic[t.id]}`).join(' • ')} • ${countOf(s.templates.classic, 'ทุกแบบ')}`,
    'AI Studio': () => `฿${s.products.ai.price}/ครั้ง • สร้างใหม่ ${onOff(s.products.ai.allowRegenerate)} • ฉาก ${countOf(s.templates.aiScenes, 'ทุกฉาก')}${s.ai.demoMode ? ' • โหมดสาธิต' : ''}`,
    'แบรนด์และธีมงาน': () => [s.brand.brandName, s.event.title, s.event.date].filter(Boolean).join(' • ') || 'ยังไม่ได้ตั้งชื่อแบรนด์หรือชื่องาน',
    'กรอบภาพ 4x6': () => `${countOf(s.templates.photoLayouts, 'ทุกกรอบ')} • เริ่มที่ ${nameOf(catalog.photo, s.templates.photoDefaultLayout)}`,
    'เข็มกลัด': () => `${s.badge.size} มม. × ${s.badge.copies} ชิ้น • ${countOf(s.templates.badgeFrames, 'ทุกกรอบ')}`,
    'การพิมพ์': () =>
      s.print.enabled
        ? ['เปิด', show('photo') && !s.print.photo && 'ไม่พิมพ์ภาพ', show('photo') && !s.print.badge && 'ไม่พิมพ์เข็มกลัด', show('photo') && s.print.queueSlip && `ใบคิว ${s.print.queuePrefix}001`].filter(Boolean).join(' • ')
        : 'ปิดการพิมพ์ (ลูกค้ารับภาพผ่าน QR)',
    'กระดาษ': () =>
      [show('photo', 'pickup') && `ภาพ ${s.paper.photo.toUpperCase()}`, show('classic') && `Classic ${s.paper.classic === 'auto' ? 'ตามเครื่อง' : s.paper.classic}`, show('ai') && `AI ${s.paper.ai === 'auto' ? 'ตามเครื่อง' : s.paper.ai.toUpperCase()}`]
        .filter(Boolean)
        .join(' • '),
    'ข้อความตกแต่ง': () => {
      const n = Object.values(s.decor).reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0);
      return n ? `${n} ข้อความ` : 'ยังไม่มีข้อความ';
    },
    'เสียงและเพลง': () => `เสียงพูด ${onOff(s.sound.voiceGuide)} • เพลง ${onOff(s.sound.musicOn)}`,
    'การรับเงิน': () => (s.payment.bypass ? 'ใช้ฟรี (ไม่เก็บเงิน)' : s.payment.enabled ? (s.payment.mode === 'live' ? 'รับเงินจริง' : 'โหมดทดสอบ') : 'จำลองการจ่ายเงิน'),
    'ดาวน์โหลดภาพ (QR)': () => (s.share.enabled ? `เปิด • เก็บ ${s.share.retentionDays} วัน` : 'ปิด'),
    'รูปจากมือถือ': () => onOff(s.phoneUpload.enabled),
    'ชูมือเริ่มถ่าย': () => onOff(s.gesture.palmStart),
    'ภาพเคลื่อนไหว (ดุ๊กดิ๊ก)': () => (s.motion.enabled ? 'เปิด • ลูกค้าเลือกตอนถ่าย' : 'ปิด'),
    'พฤติกรรมตู้': () => `กลับหน้าแรกใน ${s.idleReturnSec} วินาที • ${saved.hasPin ? 'มีรหัสผู้ดูแลจาก Admin' : 'ใช้รหัสในตู้'}`
  };
  const shownTitle = (title: string) => {
    const m = SECTION_META[title];
    return !!m && (!m.kioskOnly || scope === 'kiosk') && (!m.modes || show(...m.modes));
  };
  // Wizard: steps with nothing for the chosen mode are skipped
  const steps = WIZARD_STEPS.filter((st) => !st.titles.length || st.titles.some(shownTitle));
  const stepNow = steps[Math.min(step, steps.length - 1)]!;
  const view: EditorView = {
    variant,
    query,
    active,
    setActive,
    stepTitles: stepNow.titles,
    summary: (title) => summaries[title]?.() ?? '',
    changed: changedPaths,
    failed: failedPaths,
    preview: (title) => (['แบรนด์และธีมงาน', 'กรอบภาพ 4x6', 'เข็มกลัด', 'ข้อความตกแต่ง'].includes(title) ? <KioskPreview s={s} catalog={catalog} /> : null)
  };
  // Wizard: saved → the event's page
  useEffect(() => {
    if (wizard && result?.ok && doneHref) router.push(doneHref);
  }, [wizard, result, doneHref, router]);
  const changes = dirty ? diffSettings(saved.settings, s) : [];
  const changeCount = changes.length + (pin.action !== 'keep' ? 1 : 0);
  const groupShown = (g: GroupId) => Object.entries(SECTION_META).some(([title, m]) => m.group === g && shownTitle(title));

  const lockedCount = isPlatform ? 0 : Object.values(permissions).filter((l) => l !== 'edit').length;

  return (
    <LayerOwners.Provider value={layerOwners ? { owners: layerOwners, follow: followAction ?? null, canFollow: canEdit } : null}>
    <LevelContext.Provider value={levelOf}>
    <InheritContext.Provider value={inheritedOf}>
    <InheritActions.Provider
      value={
        layered
          ? {
              own: (id) => toggleOwn(id, true),
              canFlip: (id) => !ro && (isPlatform || permissions[id] === 'edit'),
              sourceHref: source ? (source.id ? `/o/${orgSlug}/events/${source.id}` : `/o/${orgSlug}/events/defaults`) : null
            }
          : null
      }
    >
    <form
      onSubmit={(ev) => {
        ev.preventDefault();
        save();
      }}
      className="flex flex-col gap-6 pb-28"
    >
      {!wizard ? (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="radiogroup" aria-label="แสดงการตั้งค่าของ" className="inline-flex rounded-full border border-ink-200 bg-surface p-1 text-sm">
          {[
            { all: false, label: `เฉพาะโหมด ${nameOf(APP_MODES, mode)}` },
            { all: true, label: 'ทุกโหมด' }
          ].map((o) => (
            <button key={String(o.all)} type="button" role="radio" aria-checked={showAll === o.all} onClick={() => setShowAll(o.all)} className={clsx('rounded-full px-3 py-1.5 font-medium', showAll === o.all ? 'bg-primary-600 text-white' : 'text-ink-600 hover:text-ink-900')}>
              {o.label}
            </button>
          ))}
        </div>
        {lockedCount ? (
          <span className="flex items-center gap-1.5 text-sm text-ink-500">
            <Lock className="size-4" aria-hidden />
            บางหมวดจัดการโดยผู้ให้บริการ
          </span>
        ) : null}
      </div>
      ) : null}
      {layered ? (
        <section className="overflow-hidden rounded-card border border-primary-200 bg-surface shadow-card">
          <header className="flex items-start gap-3 border-b border-ink-100 px-5 py-3">
            <span className="mt-0.5 text-primary-600 [&>svg]:size-5">
              <Layers aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg leading-tight font-semibold text-ink-900">ที่มาของการตั้งค่า</h2>
              <p className="mt-0.5 text-sm text-ink-500">
                หมวดที่ไม่ได้ติ๊ก &quot;ตั้งเฉพาะตู้นี้&quot; ใช้ค่าของ{source?.label} (แก้ในหน้านี้ไม่ได้ จะเห็นป้าย &quot;ตาม{source?.label}&quot;) • จะแก้เฉพาะตู้นี้ กดปุ่ม &quot;ตั้งเฉพาะตู้นี้&quot; ที่หัวหมวด
                หรือแก้ที่{source?.label}เพื่อให้ทุกตู้ที่ใช้ค่านั้นเปลี่ยนตาม
              </p>
            </div>
          </header>
          <fieldset disabled={ro} className="flex flex-col gap-4 p-5">
            <label className="flex max-w-md flex-col gap-1.5">
              <span className="text-sm font-medium text-ink-700">ตู้นี้ใช้ค่าของ</span>
              <select className={inputCls()} value={eventId ?? ''} onChange={(ev) => pickSource(ev.target.value || null)} aria-label="ตู้นี้ใช้ค่าของ">
                {sources.map((x) => (
                  <option key={x.id ?? ''} value={x.id ?? ''}>
                    {x.label}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <p className="mb-2 text-sm font-medium text-ink-700">ตั้งเฉพาะตู้นี้ (ไม่ตาม{source?.label})</p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {CONFIG_SECTIONS.filter((x) => !ALWAYS_OWN.includes(x.id) && (isPlatform || permissions[x.id] !== 'hidden')).map((x) => {
                  const mine = own.includes(x.id);
                  const canFlip = isPlatform || permissions[x.id] === 'edit';
                  return (
                    <label key={x.id} className={clsx('flex items-start gap-2 rounded-lg border p-2.5 text-sm', mine ? 'border-primary-600 bg-ink-50' : 'border-ink-200', !canFlip && 'opacity-60')}>
                      <input type="checkbox" className="mt-0.5 size-4" checked={mine} disabled={!canFlip} onChange={(ev) => toggleOwn(x.id, ev.target.checked)} />
                      <span>
                        <span className="font-medium">{x.label}</span>
                        <span className="block text-xs text-ink-500">{mine ? 'ตั้งที่ตู้นี้' : `ตาม${source?.label}`}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          </fieldset>
        </section>
      ) : null}

      {wizard ? (
        <div className="flex flex-col gap-4">
          <ol aria-label="ขั้นตอน" className="grid gap-2" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
            {steps.map((st, i) => (
              <li key={st.label}>
                <button type="button" onClick={() => setStep(i)} className="flex w-full flex-col gap-1.5 text-left" aria-current={i === step ? 'step' : undefined}>
                  <span className={clsx('h-1.5 rounded-full', i <= step ? 'bg-primary-600' : 'bg-ink-200')} />
                  <span className={clsx('text-sm', i === step ? 'font-semibold text-primary-700' : 'text-ink-600')}>
                    {i + 1} {st.label}
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold text-ink-900">{stepNow.label}</h2>
              <p className="text-ink-600">{stepNow.intro}</p>
            </div>
            {step === 0 && copySources.length ? (
              <label className="flex items-center gap-2 text-sm text-ink-700">
                คัดลอกจาก
                <select
                  className={clsx(inputCls(), 'h-10 w-56')}
                  value=""
                  onChange={(ev) => {
                    const src = copySources.find((x) => x.id === ev.target.value);
                    if (src) setS(structuredClone(src.settings));
                  }}
                  aria-label="คัดลอกการตั้งค่าจาก"
                >
                  <option value="">เลือกงานก่อน หรือค่ากลาง…</option>
                  {copySources.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="sticky top-16 z-20 -mx-1 bg-canvas/95 px-1 py-2 backdrop-blur">
          <label className="relative block">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-400" aria-hidden />
            <input value={query} onChange={(ev) => setQuery(ev.target.value)} placeholder="ค้นหาการตั้งค่า เช่น ราคา, QR, ใบคิว, กระดาษ" aria-label="ค้นหาการตั้งค่า" className={clsx(inputCls(), 'pl-9')} />
          </label>
        </div>
      )}

      <ViewContext.Provider value={view}>
      {wizard && stepNow.titles.length === 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Object.keys(SECTION_META)
            .filter(shownTitle)
            .map((title) => (
              <div key={title} className="rounded-card border border-ink-200 bg-surface p-4">
                <div className="text-xs font-semibold text-ink-500">{GROUPS.find((g) => g.id === SECTION_META[title]!.group)!.label}</div>
                <div className="font-semibold text-ink-900">{title}</div>
                <div className="text-sm text-ink-600">{summaries[title]?.()}</div>
              </div>
            ))}
        </div>
      ) : null}
      <div className={wizard ? (stepNow.preview ? 'grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]' : '') : 'grid gap-4 sm:grid-cols-2 xl:grid-cols-3'}>
      <div className={wizard ? 'flex flex-col gap-6' : 'contents'}>
      {!wizard
        ? GROUPS.filter((g) => groupShown(g.id)).map((g, gi) => {
            const st = groupStats(g.id);
            return (
              <h2 key={g.id} style={{ order: GROUPS.findIndex((x) => x.id === g.id) * 100 }} className={clsx('col-span-full flex items-center gap-2 text-sm font-semibold tracking-wide text-ink-500', gi > 0 && 'mt-3', query.trim() && 'hidden')}>
                {g.label}
                {st.failed ? <span className="rounded-full bg-danger-50 px-2 py-0.5 text-xs text-danger-700">ต้องแก้ {st.failed}</span> : st.changed ? <span className="rounded-full bg-primary-50 px-2 py-0.5 text-xs text-primary-700">แก้แล้ว {st.changed}</span> : null}
              </h2>
            );
          })
        : null}
      <Section title="โหมดตู้" perm="mode" icon={<LayoutGrid aria-hidden />} hint="ตู้เปลี่ยนโหมดเมื่อกลับถึงหน้าแรก">
        <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2 lg:grid-cols-4">
          {APP_MODES.map((m) => (
            <label key={m.id} className={clsx('flex cursor-pointer flex-col gap-1 rounded-xl border p-4', mode === m.id ? 'border-primary-600 bg-ink-50 ring-1 ring-primary-600' : 'border-ink-200', ro && 'cursor-default')}>
              <span className="flex items-center gap-2 font-semibold">
                <input type="radio" name="appMode" checked={mode === m.id} onChange={() => set('appMode')(m.id)} disabled={ro} />
                {m.name}
              </span>
              <span className="text-sm text-ink-500">{m.desc}</span>
            </label>
          ))}
        </div>
      </Section>


      {scope === 'kiosk' ? (
      <Section title="ตัวตนตู้" perm="identity" icon={<IdCard aria-hidden />}>
        <Text label="ชื่อตู้บนหน้าจอ" value={s.identity.name} onChange={set('identity.name')} error={err('identity.name')} disabled={ro} maxLength={100} />
        <Text label="สถานที่" value={s.identity.location} onChange={set('identity.location')} error={err('identity.location')} disabled={ro} maxLength={200} />
        {show('pickup', 'photo') ? (
          <Text label="ชื่อจุดรับรูป" value={s.identity.pickupStationName} onChange={set('identity.pickupStationName')} error={err('identity.pickupStationName')} disabled={ro} maxLength={100} hint="พิมพ์บนใบรับรูป" />
        ) : null}
      </Section>
      ) : null}

      {show('photo') ? (
        <Section title="สินค้าและราคา (Photo 4x6)" perm="products" icon={<ShoppingBag aria-hidden />} hint="เปิดขายอย่างเดียวจะข้ามหน้าเลือกสินค้า">
          <div className="flex flex-col gap-3">
            <Toggle label="ภาพ 4x6" checked={s.products.photo.sell} onChange={set('products.photo.sell')} disabled={ro} error={err('products.photo.sell')} />
            <Num label="ราคา" value={s.products.photo.price} onChange={set('products.photo.price')} error={err('products.photo.price')} disabled={ro || !s.products.photo.sell} min={0} suffix="บาท" />
          </div>
          <div className="flex flex-col gap-3">
            <Toggle label="เข็มกลัด" checked={s.products.badge.sell} onChange={set('products.badge.sell')} disabled={ro} />
            <Num label="ราคา" value={s.products.badge.price} onChange={set('products.badge.price')} error={err('products.badge.price')} disabled={ro || !s.products.badge.sell} min={0} suffix="บาท" />
          </div>
          <div className="flex flex-col gap-3">
            <Toggle label="ภาพ + เข็มกลัด" checked={s.products.bundle.sell} onChange={set('products.bundle.sell')} disabled={ro} />
            <Num label="ราคา" value={s.products.bundle.price} onChange={set('products.bundle.price')} error={err('products.bundle.price')} disabled={ro || !s.products.bundle.sell} min={0} suffix="บาท" />
          </div>
          <Choice
            label="การรับภาพ"
            value={s.photoFulfillment}
            options={[
              { id: 'kiosk', name: 'พิมพ์ที่ตู้' },
              { id: 'pickup', name: 'รับที่จุดรับรูป (พิมพ์ใบรับรูป)' }
            ]}
            onChange={set('photoFulfillment')}
            disabled={ro}
          />
        </Section>
      ) : null}

      {show('classic') ? (
        <Section title="ราคา Classic Receipt" icon={<ReceiptText aria-hidden />}>
          <Gate id="products">
          {CLASSIC_TEMPLATES.map((t) => (
            <Num key={t.id} label={t.name} value={s.products.classic[t.id]} onChange={set(`products.classic.${t.id}`)} error={err(`products.classic.${t.id}`)} disabled={ro} min={0} suffix="บาท" />
          ))}
          </Gate>
          <Gate id="templates">
          <PickList label="แบบที่เปิดให้เลือก" all={catalog.classic} value={s.templates.classic} onChange={set('templates.classic')} disabled={ro} error={err('templates.classic')} />
          </Gate>
        </Section>
      ) : null}

      {show('ai') ? (
        <Section title="AI Studio" icon={<Sparkles aria-hidden />} hint="ผู้ให้บริการและโมเดล AI ตั้งโดยแพลตฟอร์ม">
          <Gate id="products">
            <Num label="ราคาต่อการสร้าง 1 ครั้ง" value={s.products.ai.price} onChange={set('products.ai.price')} error={err('products.ai.price')} disabled={ro} min={0} suffix="บาท" />
          </Gate>
          <div className="flex flex-col gap-3">
            <Gate id="products">
              <Toggle label="ให้กดสร้างภาพใหม่ได้" hint="สร้างใหม่ต้องจ่ายอีกครั้ง" checked={s.products.ai.allowRegenerate} onChange={set('products.ai.allowRegenerate')} disabled={ro} />
            </Gate>
            <Gate id="ai">
              <Toggle label="โหมดสาธิต" hint="จำลองผลในตู้ ไม่เรียก AI ไม่มีค่าใช้จ่าย" checked={s.ai.demoMode} onChange={set('ai.demoMode')} disabled={ro} />
            </Gate>
          </div>
          <Gate id="templates">
          <PickList label="ฉาก AI ที่เปิด" all={catalog.ai} value={s.templates.aiScenes} onChange={set('templates.aiScenes')} disabled={ro} error={err('templates.aiScenes')} />
          </Gate>
        </Section>
      ) : null}

      <Section title="แบรนด์และธีมงาน" perm="brand" icon={<Palette aria-hidden />}>
        <Text label="ชื่อแบรนด์" value={s.brand.brandName} onChange={set('brand.brandName')} error={err('brand.brandName')} disabled={ro} maxLength={60} />
        <Text label="หัวข้อหน้าแรก" value={s.brand.photoTitle} onChange={set('brand.photoTitle')} error={err('brand.photoTitle')} disabled={ro} maxLength={80} />
        <Text label="คำโปรย" value={s.brand.photoTagline} onChange={set('brand.photoTagline')} error={err('brand.photoTagline')} disabled={ro} maxLength={160} wide />
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Choice label="ธีมงาน" value={s.event.preset} options={EVENT_PRESETS} onChange={set('event.preset')} disabled={ro} />
          </div>
          {!ro ? (
            <button type="button" className={buttonClass('secondary')} onClick={applyPreset} title="ใส่ชื่องาน สี และกรอบที่แนะนำของธีมนี้">
              ใช้ค่าของธีม
            </button>
          ) : null}
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink-700">สีธีม</span>
          <span className="flex items-center gap-2">
            <input type="color" className="h-10 w-14 rounded border border-ink-200" value={s.event.accent || '#1c1917'} onChange={(ev) => set('event.accent')(ev.target.value.toUpperCase())} disabled={ro} aria-label="เลือกสี" />
            <input className={inputCls(!!err('event.accent'))} value={s.event.accent} onChange={(ev) => set('event.accent')(ev.target.value)} placeholder="ว่าง = สีของแต่ละกรอบ" disabled={ro} maxLength={7} />
          </span>
          <Err msg={err('event.accent')} />
        </label>
        <Text label="ชื่องาน" value={s.event.title} onChange={set('event.title')} error={err('event.title')} disabled={ro} maxLength={80} />
        <Text label="ข้อความรอง" value={s.event.subtitle} onChange={set('event.subtitle')} error={err('event.subtitle')} disabled={ro} maxLength={120} />
        <Text label="วันที่บนภาพ" value={s.event.date} onChange={set('event.date')} error={err('event.date')} disabled={ro} maxLength={40} hint="เว้นว่าง = วันที่ของวันนั้น" />
        <Choice
          label="ชื่อแบรนด์บนภาพและเข็มกลัด"
          value={s.brand.printBranding}
          options={[
            { id: 'brand', name: 'แสดงชื่อแบรนด์' },
            { id: 'none', name: 'ไม่แสดง (เฉพาะข้อความงาน)' }
          ]}
          onChange={set('brand.printBranding')}
          disabled={ro}
        />
        {show('photo') ? (
          <Toggle label="แสดงตัวอย่างเข็มกลัดในหน้าแรก" hint="ลอยข้างภาพ 4x6 ในหน้า Animation เมื่อขายเข็มกลัด" checked={s.attract.showBadges} onChange={set('attract.showBadges')} disabled={ro} />
        ) : null}
      </Section>

      {show('photo') ? (
        <Section title="กรอบภาพ 4x6" perm="templates" icon={<Frame aria-hidden />}>
          <PickList label="กรอบที่เปิดให้ลูกค้าเลือก" all={catalog.photo} value={s.templates.photoLayouts} onChange={set('templates.photoLayouts')} disabled={ro} error={err('templates.photoLayouts')} />
          <Choice label="กรอบเริ่มต้น" value={s.templates.photoDefaultLayout} options={layoutOptions} onChange={set('templates.photoDefaultLayout')} disabled={ro} error={err('templates.photoDefaultLayout')} />
        </Section>
      ) : null}

      {show('photo') ? (
        <Section title="เข็มกลัด" icon={<BadgeCheck aria-hidden />} hint="วงตัดและค่าชดเชยขนาดตั้งที่ตู้ (ผูกกับเครื่องกดและเครื่องพิมพ์)">
          <Gate id="badge">
          <Choice label="ขนาดเข็มกลัด" value={s.badge.size} options={BADGE_SIZES} onChange={set('badge.size')} disabled={ro} error={err('badge.size')} />
          <Num label="จำนวนต่อออเดอร์" value={s.badge.copies} onChange={set('badge.copies')} error={err('badge.copies')} disabled={ro} min={1} max={12} suffix="ชิ้น" hint="ตู้จำกัดตามที่ใส่ได้บนกระดาษ 4x6" />
          </Gate>
          <Gate id="templates">
          <PickList label="กรอบเข็มกลัดที่เปิด" all={catalog.badge} value={s.templates.badgeFrames} onChange={set('templates.badgeFrames')} disabled={ro} error={err('templates.badgeFrames')} />
          <Choice label="กรอบเริ่มต้น" value={s.templates.badgeDefaultFrame} options={frameOptions} onChange={set('templates.badgeDefaultFrame')} disabled={ro} error={err('templates.badgeDefaultFrame')} />
          </Gate>
        </Section>
      ) : null}

      <Section title="การพิมพ์" perm="print" icon={<Printer aria-hidden />} hint="ปิดการพิมพ์ = ตู้ไม่แสดงขั้นตอนหรือข้อความเรื่องการพิมพ์เลย ลูกค้าเห็นภาพบนจอพร้อม QR ดาวน์โหลด (ถ้าเปิดดาวน์โหลด)">
        <div className="flex flex-col gap-3">
          <Toggle label="เปิดการพิมพ์ที่ตู้ (ทุกโหมด)" checked={s.print.enabled} onChange={set('print.enabled')} disabled={ro} />
          {!s.print.enabled && !s.share.enabled ? (
            <p className="rounded-md bg-warning-50 px-3 py-2 text-sm text-warning-800">ปิดทั้งการพิมพ์และการดาวน์โหลด: ลูกค้าจะได้ดูภาพบนจอเท่านั้น</p>
          ) : null}
          {!s.print.enabled && s.photoFulfillment === 'pickup' ? (
            <p className="rounded-md bg-warning-50 px-3 py-2 text-sm text-warning-800">ปิดการพิมพ์อยู่ ตู้จึงไม่ส่งออเดอร์ไปจุดรับรูป ลูกค้ารับภาพทาง QR แทน</p>
          ) : null}
        </div>
        <Text
          label="ข้อความหน้ารับภาพ (เมื่อไม่พิมพ์)"
          value={s.print.noPrintNote}
          onChange={set('print.noPrintNote')}
          error={err('print.noPrintNote')}
          disabled={ro || s.print.enabled}
          maxLength={160}
          hint="ว่าง = ใช้ข้อความของตู้ เช่น &quot;สแกน QR เพื่อบันทึกภาพลงมือถือ&quot; หรือ &quot;ถ่ายภาพหน้าจอนี้ไว้ได้เลย&quot;"
        />
        {show('photo') ? (
          <>
            <div className="flex flex-col gap-3">
              <Toggle label="ตู้พิมพ์ภาพ (4x6 / แผ่นภาพ)" checked={s.print.photo} onChange={set('print.photo')} disabled={ro || !s.print.enabled} hint="โหมด 4x6 • ลูกค้ายังซื้อได้ตามเดิม เช่น ทำเข็มกลัดที่โต๊ะเจ้าหน้าที่" />
              <Toggle label="ตู้พิมพ์เข็มกลัด" checked={s.print.badge} onChange={set('print.badge')} disabled={ro || !s.print.enabled} />
            </div>
            <div className="flex flex-col gap-3">
              <Toggle label="พิมพ์ใบคิวให้ลูกค้า" hint="หมายเลขคิว + QR ที่เครื่องพิมพ์ใบเสร็จ ก่อนพิมพ์ภาพ • คิวเริ่ม 001 ใหม่ทุกวัน" checked={s.print.queueSlip} onChange={set('print.queueSlip')} disabled={ro || !s.print.enabled} />
            </div>
            <Text label="ตัวอักษรหน้าเลขคิว" value={s.print.queuePrefix} onChange={(v) => set('print.queuePrefix')(v.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 3))} error={err('print.queuePrefix')} disabled={ro || !s.print.queueSlip || !s.print.enabled} maxLength={3} hint="เช่น A ได้ A001 • ว่าง = 001" />
            <Choice
              label="เลขคิวบนภาพ"
              value={s.print.queueOnPhoto}
              options={[
                { id: 'off', name: 'ไม่พิมพ์บนภาพ' },
                { id: 'corner', name: 'พิมพ์เล็กๆ ที่มุมภาพ' }
              ]}
              onChange={set('print.queueOnPhoto')}
              disabled={ro || !s.print.queueSlip || !s.print.enabled}
            />
          </>
        ) : null}
      </Section>

      {show('photo', 'pickup', 'classic', 'ai') ? (
        <Section title="กระดาษ" perm="paper" icon={<Ruler aria-hidden />} hint="ค่าเริ่มต้นของตู้ ช่างที่หน้างานปรับเองได้ (ตู้รายงานค่าที่ปรับไว้ใน &quot;ค่าฝั่งตู้&quot;) • เครื่องพิมพ์ ขอบ และการชดเชยขนาดตั้งที่ตู้">
          {show('classic') ? (
            <Choice
              label="Classic: กระดาษใบเสร็จ"
              value={s.paper.classic}
              options={[
                { id: 'auto', name: 'ตามเครื่องพิมพ์ของตู้' },
                { id: '58mm', name: 'กระดาษความร้อน 58 มม.' },
                { id: '80mm', name: 'กระดาษความร้อน 80 มม.' }
              ]}
              onChange={set('paper.classic')}
              disabled={ro}
            />
          ) : null}
          {show('ai') ? (
            <Choice
              label="AI Studio: กระดาษ"
              value={s.paper.ai}
              options={[
                { id: 'auto', name: 'ตามเครื่องพิมพ์ของตู้' },
                { id: 'receipt', name: 'ใบเสร็จความร้อน (ขาวดำ)' },
                { id: '4x6', name: 'ภาพสี 4x6 มีแถบชื่องาน' },
                { id: '4x6-full', name: 'ภาพสี 4x6 เต็มแผ่น' },
                { id: 'a4', name: 'ภาพสีบนแผ่น A4 (ตาม layout แผ่น)' },
                { id: 'a5', name: 'ภาพสีบนแผ่น A5 (ตาม layout แผ่น)' }
              ]}
              onChange={set('paper.ai')}
              disabled={ro}
            />
          ) : null}
          {show('ai') && (s.paper.ai === 'a4' || s.paper.ai === 'a5') && !show('photo') ? (
            <SheetLayoutEditor
              key={`ai-${s.paper.ai}`}
              sheet={s.paper.ai}
              value={s.paper[s.paper.ai === 'a5' ? 'a5Layout' : 'a4Layout']}
              onChange={set(`paper.${s.paper.ai}Layout`)}
              badgeCut={(BADGE_SIZES.find((b) => b.id === s.badge.size) ?? BADGE_SIZES[3]).cut}
              disabled={ro || levelOf('paper') !== 'edit'}
            />
          ) : null}
          {show('photo', 'pickup') ? (
          <>
          <Choice
            label="กระดาษของเครื่องพิมพ์ภาพ"
            value={s.paper.photo}
            options={[
              { id: '4x6', name: 'กระดาษ 4x6' },
              { id: 'a4', name: 'กระดาษโฟโต้ A4' },
              { id: 'a5', name: 'กระดาษโฟโต้ A5' }
            ]}
            onChange={set('paper.photo')}
            disabled={ro}
          />
          <Choice
            label="กระดาษเข็มกลัด"
            value={s.paper.badge}
            options={[
              { id: '4x6', name: 'แผ่น 4x6 ของตัวเอง' },
              { id: 'a4', name: 'แผ่น A4 / A5 ของตัวเอง' },
              { id: 'with-photo', name: 'รวมในแผ่นเดียวกับภาพ (A4 / A5)' }
            ]}
            onChange={set('paper.badge')}
            disabled={ro}
          />
          {s.paper.photo === 'a4' || s.paper.photo === 'a5' ? (
            <SheetLayoutEditor
              key={s.paper.photo}
              sheet={s.paper.photo}
              value={s.paper[s.paper.photo === 'a5' ? 'a5Layout' : 'a4Layout']}
              onChange={set(`paper.${s.paper.photo}Layout`)}
              badgeCut={(BADGE_SIZES.find((b) => b.id === s.badge.size) ?? BADGE_SIZES[3]).cut}
              disabled={ro || levelOf('paper') !== 'edit'}
            />
          ) : null}
          </>
          ) : null}
        </Section>
      ) : null}

      {show('photo') ? (
        <Section title="ข้อความตกแต่ง" perm="decor" icon={<Type aria-hidden />} hint="ข้อความของร้านบนกรอบภาพ 4x6 และเข็มกลัด ตู้วาดทับบนกรอบตอนพิมพ์ • ชื่องาน วันที่ ชื่อร้าน ดึงจากแบรนด์และธีมงาน">
          <DecorTextEditor
            value={s.decor}
            onChange={set('decor')}
            photo={catalog.photo}
            badge={catalog.badge}
            values={{ 'event.title': s.event.title, 'event.subtitle': s.event.subtitle, 'event.date': s.event.date || new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase(), 'brand.brandName': s.brand.brandName }}
            disabled={ro || levelOf('decor') !== 'edit'}
          />
        </Section>
      ) : null}

      {show('photo') ? (
        <Section title="เสียงและเพลง" perm="sound" icon={<Music aria-hidden />} hint="ค่าเริ่มต้นของตู้ เจ้าหน้าที่ปรับความดังที่ตู้ได้ตามสถานที่">
          <div className="flex flex-col gap-3">
            <Toggle label="เสียงพูดแนะนำลูกค้า" checked={s.sound.voiceGuide} onChange={set('sound.voiceGuide')} disabled={ro} />
            <Num label="ระดับเสียงพูด" value={s.sound.voiceVolume} onChange={set('sound.voiceVolume')} error={err('sound.voiceVolume')} disabled={ro || !s.sound.voiceGuide} min={0} max={200} suffix="%" />
          </div>
          <div className="flex flex-col gap-3">
            <Toggle label="เพลงหน้าแรก" hint="เล่นเบาลงระหว่างลูกค้าใช้งาน" checked={s.sound.musicOn} onChange={set('sound.musicOn')} disabled={ro} />
            <Choice
              label="เพลง"
              value={s.sound.musicTrack}
              options={[
                { id: 'kawaii', name: 'Kawaii pop (สดใส)' },
                { id: 'lofi', name: 'Lo-fi (นุ่มสบาย)' }
              ]}
              onChange={set('sound.musicTrack')}
              disabled={ro || !s.sound.musicOn}
            />
            <Num label="ระดับเสียงเพลง" value={s.sound.musicVolume} onChange={set('sound.musicVolume')} error={err('sound.musicVolume')} disabled={ro || !s.sound.musicOn} min={0} max={200} suffix="%" />
          </div>
        </Section>
      ) : null}

      <Section title="การรับเงิน" perm="payment" icon={<QrCode aria-hidden />} hint="QR PromptPay สร้างโดยระบบกลาง">
        <Toggle label="ใช้ฟรี (ไม่เก็บเงิน)" hint="ข้ามหน้าชำระเงินทุกโหมด บันทึกเป็น &quot;ไม่เก็บเงิน&quot; เช่น งานที่ลูกค้าจ้างเหมา" checked={s.payment.bypass} onChange={set('payment.bypass')} disabled={ro} />
        <Toggle label="เปิดรับเงิน" hint="ปิด = จำลองการจ่ายเงิน (ไม่เก็บเงินจริง)" checked={s.payment.enabled} onChange={set('payment.enabled')} disabled={ro} />
        <Choice
          label="โหมด"
          value={s.payment.mode}
          options={[
            { id: 'test', name: 'ทดสอบ (ไม่เก็บเงินจริง)' },
            { id: 'live', name: livePaymentsAllowed ? 'รับเงินจริง' : 'รับเงินจริง (ยังไม่ได้รับอนุญาต)' }
          ]}
          onChange={set('payment.mode')}
          disabled={ro || !s.payment.enabled}
          error={err('payment.mode')}
        />
        <Text label="อีเมลร้าน (ใบเสร็จ)" type="email" value={s.payment.email} onChange={set('payment.email')} error={err('payment.email')} disabled={ro} />
        <Num label="QR หมดอายุใน" value={s.payment.qrTimeoutSec} onChange={set('payment.qrTimeoutSec')} error={err('payment.qrTimeoutSec')} disabled={ro} min={60} max={900} suffix="วินาที" />
      </Section>

      <Section title="ดาวน์โหลดภาพ (QR)" perm="share" icon={<Download aria-hidden />} hint={storageConfigured ? 'ภาพเก็บใน bucket ของบัญชีนี้ ลบอัตโนมัติตามวันที่ตั้ง' : 'บัญชีนี้ยังไม่มีพื้นที่เก็บภาพ ติดต่อผู้ดูแลแพลตฟอร์ม'}>
        <Toggle label="ให้ลูกค้าสแกน QR ดาวน์โหลดภาพ" checked={s.share.enabled} onChange={set('share.enabled')} disabled={ro || (!storageConfigured && !s.share.enabled)} error={err('share.enabled')} />
        <Num label="เก็บภาพ" value={s.share.retentionDays} onChange={set('share.retentionDays')} error={err('share.retentionDays')} disabled={ro || !s.share.enabled} min={1} max={90} suffix="วัน" />
      </Section>

      <Section title="ชูมือเริ่มถ่าย" perm="phone" icon={<Hand aria-hidden />} hint="ลูกค้าชูฝ่ามือ 5 นิ้วให้กล้องเห็นค้างไว้ราว 1 วินาที ตู้เริ่มนับ 3-2-1 เอง (ทุกโหมด) • ปุ่มกดถ่ายยังใช้ได้เหมือนเดิม • ใช้กับช็อตแรก ช็อตต่อไปนับถอยหลังเอง">
        <Toggle label="เริ่มถ่ายด้วยการชูฝ่ามือ" checked={s.gesture.palmStart} onChange={set('gesture.palmStart')} disabled={ro} />
      </Section>

      {show('photo', 'classic') ? (
        <Section title="ภาพเคลื่อนไหว (ดุ๊กดิ๊ก)" perm="phone" icon={<Sparkles aria-hidden />} hint="ลูกค้าเปิดสวิตช์ &quot;เปิดการถ่ายภาพเคลื่อนไหว 5 วิ&quot; ได้ที่หน้าถ่ายภาพ ทุกกรอบ • หลังชัตเตอร์ตู้ถ่ายรัว 5 วิ แล้วได้ภาพ GIF ในลิงก์ QR • ภาพที่พิมพ์ยังเป็นภาพนิ่ง">
          <Toggle label="ให้ลูกค้าถ่ายภาพเคลื่อนไหวได้" checked={s.motion.enabled} onChange={set('motion.enabled')} disabled={ro} hint={s.share.enabled ? 'ต้องเปิดดาวน์โหลดภาพ (QR) ด้วย ลูกค้าจึงได้รับไฟล์' : 'ยังปิดดาวน์โหลดภาพ (QR) อยู่: ลูกค้าจะยังไม่ได้รับไฟล์เคลื่อนไหวจนกว่าจะเปิด'} />
        </Section>
      ) : null}

      {show('photo', 'classic') ? (
        <Section title="รูปจากมือถือ" perm="phone" icon={<Smartphone aria-hidden />} hint="ลูกค้าสแกน QR ที่ตู้ เลือกรูปจากอัลบั้มมือถือ แล้วส่งเข้าตู้แทนการถ่าย (Photo 4x6 / เข็มกลัด / Classic) • รูปถูกลบจากระบบทันทีที่ตู้รับแล้ว">
          <Toggle label="ให้ลูกค้าส่งรูปจากมือถือได้" checked={s.phoneUpload.enabled} onChange={set('phoneUpload.enabled')} disabled={ro} hint="ตู้ที่เชื่อม Admin ส่งผ่านอินเทอร์เน็ต ตู้ที่ไม่ได้เชื่อม ลูกค้าต้องต่อ Wi-Fi เดียวกับตู้" />
        </Section>
      ) : null}

      <Section title="พฤติกรรมตู้" perm="behavior" icon={<Timer aria-hidden />}>
        <Num label="กลับหน้าแรกเมื่อไม่มีการแตะ" value={s.idleReturnSec} onChange={set('idleReturnSec')} error={err('idleReturnSec')} disabled={ro} min={30} max={600} suffix="วินาที" hint="เฉพาะหน้าก่อนจ่ายเงิน" />
        <fieldset className="flex flex-col gap-2" disabled={ro}>
          <legend className="mb-1 text-sm font-medium text-ink-700">รหัสผู้ดูแลตู้ (เข้าหน้า Config)</legend>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" checked={pin.action === 'keep'} onChange={() => setPin({ action: 'keep' })} /> {saved.hasPin ? 'ใช้รหัสเดิม' : 'ใช้รหัสที่ตั้งในตู้'}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" checked={pin.action === 'set'} onChange={() => setPin({ action: 'set', pin: '' })} /> ตั้งรหัสใหม่
          </label>
          {pin.action === 'set' ? (
            <input
              className={inputCls(!!err('pin.pin'))}
              inputMode="numeric"
              autoComplete="off"
              placeholder="ตัวเลข 4-8 หลัก"
              value={pin.pin}
              maxLength={8}
              onChange={(ev) => setPin({ action: 'set', pin: ev.target.value.replace(/\D/g, '') })}
              aria-label="รหัสผู้ดูแลใหม่"
            />
          ) : null}
          {saved.hasPin ? (
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" checked={pin.action === 'clear'} onChange={() => setPin({ action: 'clear' })} /> ยกเลิกรหัสจาก Admin (ใช้รหัสในตู้)
            </label>
          ) : null}
          <Err msg={err('pin.pin')} />
          <span className="text-xs text-ink-500">ระบบเก็บและส่งให้ตู้เฉพาะค่า hash</span>
        </fieldset>
      </Section>

      </div>
      {wizard && stepNow.preview ? (
        <aside aria-label="ตัวอย่างที่ตู้" className="sticky top-20 hidden rounded-card bg-ink-900 p-5 lg:block">
          <KioskPreview s={s} catalog={catalog} />
        </aside>
      ) : null}
      </div>
      </ViewContext.Provider>

      {wizard && canEdit ? (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-ink-200 bg-surface/95 px-4 py-3 backdrop-blur lg:left-64">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
            <button type="button" disabled={step === 0 || pending} onClick={() => setStep((x) => Math.max(0, x - 1))} className={buttonClass('outline')}>
              <ChevronLeft className="size-4" aria-hidden />
              ย้อนกลับ
            </button>
            {result && !result.ok ? (
              <p role="alert" className="text-sm text-danger-600">
                {result.message}
              </p>
            ) : null}
            {step < steps.length - 1 ? (
              // own keys: the same element turning into the submit button mid-click would submit the form
              <button key="next" type="button" onClick={() => setStep((x) => Math.min(steps.length - 1, x + 1))} className={buttonClass()}>
                ถัดไป: {steps[step + 1]!.label}
                <ChevronRight className="size-4" aria-hidden />
              </button>
            ) : (
              <button key="save" type="submit" disabled={pending} className={buttonClass()}>
                <Check className="size-4" aria-hidden />
                {pending ? 'กำลังบันทึก…' : 'บันทึกงานนี้'}
              </button>
            )}
          </div>
        </div>
      ) : null}

      {!wizard && canEdit ? (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-ink-200 bg-surface/95 px-4 py-3 backdrop-blur lg:left-64">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3">
            {reviewing && dirty ? (
              <div className="max-h-56 w-full overflow-y-auto rounded-lg border border-ink-200 bg-surface p-3 text-sm">
                <p className="mb-2 font-semibold text-ink-900">สิ่งที่จะเปลี่ยน ({changeCount})</p>
                {!changeCount ? <p className="text-ink-600">เปลี่ยนที่มาของการตั้งค่า (ค่ากลาง / งาน / ตั้งเฉพาะตู้นี้)</p> : null}
                {pin.action !== 'keep' ? <p className="text-ink-800">รหัสผู้ดูแลตู้: {pin.action === 'set' ? 'ตั้งรหัสใหม่' : 'ยกเลิกรหัสจาก Admin'}</p> : null}
                <ul className="flex flex-col gap-1">
                  {changes.map((c) => (
                    <li key={c.path} className="flex flex-wrap gap-x-2">
                      <span className="font-medium text-ink-800">{c.label}:</span>
                      <span className="text-ink-500 line-through">{c.before}</span>
                      <span aria-hidden>→</span>
                      <span className="text-ink-900">{c.after}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {dirty ? (
              <button type="button" onClick={() => setReviewing((r) => !r)} className="text-sm font-medium text-primary-700 underline">
                {reviewing ? 'ซ่อนรายการ' : changeCount ? `ดูสิ่งที่เปลี่ยน (${changeCount})` : 'ดูสิ่งที่เปลี่ยน'}
              </button>
            ) : null}
            <input className={clsx(inputCls(), 'min-w-48 flex-1')} placeholder="บันทึกสั้นๆ ว่าเปลี่ยนอะไร (ไม่บังคับ)" value={note} onChange={(ev) => setNote(ev.target.value)} maxLength={255} aria-label="บันทึกการเปลี่ยนแปลง" />
            <button type="submit" disabled={pending || !dirty} className={buttonClass()}>
              {pending ? 'กำลังบันทึก…' : 'บันทึกและส่งไปตู้'}
            </button>
            {dirty && !pending ? (
              <button
                type="button"
                className={buttonClass('ghost')}
                onClick={() => {
                  setS(saved.settings);
                  setEventId(saved.eventId);
                  setOwn(saved.own);
                  setPin({ action: 'keep' });
                  setResult(null);
                }}
              >
                ยกเลิกการแก้ไข
              </button>
            ) : null}
            {result?.message ? (
              <p role={result.ok ? 'status' : 'alert'} className={clsx('w-full text-sm', result.ok ? 'text-success-700' : 'text-danger-600')}>
                {result.message}
                {!result.ok && errorCount ? ` (${errorCount} จุด ดูข้อความสีแดงด้านบน)` : ''}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </form>
    </InheritActions.Provider>
    </InheritContext.Provider>
    </LevelContext.Provider>
    </LayerOwners.Provider>
  );
}
