import { sql } from 'drizzle-orm';
import {
  boolean,
  char,
  datetime,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  text,
  uniqueIndex,
  varchar
} from 'drizzle-orm/mysql-core';
import { jsonText } from './json-text';
import type { TemplateFiles, TemplateSpec } from '@photobooth/contracts';

/**
 * Phase 0 tables: platform, customers (organizations), users, sessions, branches, audit.
 * Conventions (docs/ADMIN_SYSTEM_DESIGN.md §6.1):
 *  - ids are VARCHAR(32) prefixed ULIDs (org_…, usr_…)
 *  - every customer-owned table carries org_id and leads its indexes with it
 *  - times are UTC DATETIME(3)
 */

const id = (name = 'id') => varchar(name, { length: 32 });
const createdAt = () => datetime('created_at', { mode: 'date', fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`);
const updatedAt = () =>
  datetime('updated_at', { mode: 'date', fsp: 3 })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP(3)`)
    .$onUpdate(() => new Date());

export const ORG_ROLES = ['owner', 'manager', 'designer', 'pickup_staff', 'viewer'] as const;
export type OrgRole = (typeof ORG_ROLES)[number];
export const PLATFORM_ROLES = ['platform_admin', 'platform_support'] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export const organizations = mysqlTable(
  'organizations',
  {
    id: id().primaryKey(),
    slug: varchar('slug', { length: 64 }).notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    status: mysqlEnum('status', ['active', 'suspended']).notNull().default('active'),
    kioskQuota: int('kiosk_quota').default(5), // NULL = unlimited
    userQuota: int('user_quota').default(3), // customer members; NULL = unlimited (decision D14)
    aiMonthlyQuota: int('ai_monthly_quota'), // images per month; NULL = unlimited
    /** Customers may add / pair / unpair kiosks themselves (decision D12: off, the platform does it). */
    customerCanAddKiosks: boolean('customer_can_add_kiosks').notNull().default(false),
    /** Per-section kiosk settings permissions (lib/config-permissions.ts); NULL = defaults. */
    configPermissions: jsonText<Record<string, string>>('config_permissions'),
    livePaymentsAllowed: boolean('live_payments_allowed').notNull().default(false),
    timezone: varchar('timezone', { length: 64 }).notNull().default('Asia/Bangkok'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: datetime('deleted_at', { mode: 'date', fsp: 3 })
  },
  (t) => [uniqueIndex('organizations_slug_uq').on(t.slug)]
);

export const users = mysqlTable(
  'users',
  {
    id: id().primaryKey(),
    email: varchar('email', { length: 254 }).notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    mustChangePassword: boolean('must_change_password').notNull().default(true),
    platformRole: mysqlEnum('platform_role', PLATFORM_ROLES),
    totpSecretEnc: text('totp_secret_enc'),
    failedLogins: int('failed_logins').notNull().default(0),
    lockedUntil: datetime('locked_until', { mode: 'date', fsp: 3 }),
    lastLoginAt: datetime('last_login_at', { mode: 'date', fsp: 3 }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (t) => [uniqueIndex('users_email_uq').on(t.email)]
);

export const userSessions = mysqlTable(
  'user_sessions',
  {
    id: id().primaryKey(),
    tokenHash: char('token_hash', { length: 64 }).notNull(),
    userId: id('user_id').notNull(),
    ip: varchar('ip', { length: 64 }),
    userAgent: varchar('user_agent', { length: 255 }),
    createdAt: createdAt(),
    expiresAt: datetime('expires_at', { mode: 'date', fsp: 3 }).notNull(),
    lastSeenAt: datetime('last_seen_at', { mode: 'date', fsp: 3 }).notNull()
  },
  (t) => [uniqueIndex('user_sessions_token_uq').on(t.tokenHash), index('user_sessions_user_idx').on(t.userId)]
);

export const memberships = mysqlTable(
  'memberships',
  {
    orgId: id('org_id').notNull(),
    userId: id('user_id').notNull(),
    role: mysqlEnum('role', ORG_ROLES).notNull(),
    allBranches: boolean('all_branches').notNull().default(true),
    createdAt: createdAt()
  },
  (t) => [primaryKey({ columns: [t.orgId, t.userId] }), index('memberships_user_idx').on(t.userId)]
);

export const membershipBranches = mysqlTable(
  'membership_branches',
  {
    orgId: id('org_id').notNull(),
    userId: id('user_id').notNull(),
    branchId: id('branch_id').notNull()
  },
  (t) => [primaryKey({ columns: [t.orgId, t.userId, t.branchId] })]
);

export const branches = mysqlTable(
  'branches',
  {
    id: id().primaryKey(),
    orgId: id('org_id').notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    address: varchar('address', { length: 500 }).notNull().default(''),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (t) => [index('branches_org_idx').on(t.orgId, t.name)]
);

export const auditLogs = mysqlTable(
  'audit_logs',
  {
    id: id().primaryKey(),
    orgId: id('org_id'), // NULL = platform-level action
    userId: id('user_id'),
    actingAsPlatform: boolean('acting_as_platform').notNull().default(false),
    action: varchar('action', { length: 64 }).notNull(),
    resourceType: varchar('resource_type', { length: 64 }).notNull(),
    resourceId: varchar('resource_id', { length: 64 }),
    before: jsonText<unknown>('before'),
    after: jsonText<unknown>('after'),
    ip: varchar('ip', { length: 64 }),
    at: datetime('at', { mode: 'date', fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`)
  },
  (t) => [index('audit_org_at_idx').on(t.orgId, t.at), index('audit_at_idx').on(t.at)]
);

// ─── Kiosks (Phase 1) ────────────────────────────────────────────────────────

export interface PrinterState {
  role: 'main' | 'photo' | 'badge';
  name: string;
  ok: boolean;
  error?: string;
}
export interface CameraState {
  source: 'webcam' | 'digicam';
  ok: boolean;
  error?: string;
}

/**
 * A booth. The row exists from "add kiosk" (status pending) so the pairing code has
 * something to bind to; `kiosk_id` (KS-…) is filled in when the kiosk pairs. Unpairing
 * clears `kiosk_id` (kept in `former_kiosk_id`) so the machine can be paired again.
 */
export const kiosks = mysqlTable(
  'kiosks',
  {
    id: id().primaryKey(),
    orgId: id('org_id').notNull(),
    branchId: id('branch_id'),
    kioskId: varchar('kiosk_id', { length: 16 }),
    formerKioskId: varchar('former_kiosk_id', { length: 16 }),
    name: varchar('name', { length: 100 }).notNull(),
    /** disabled = switched off by the platform (token kept, kiosk refuses customers). */
    status: mysqlEnum('status', ['pending', 'active', 'disabled', 'revoked']).notNull().default('pending'),
    disabledReason: varchar('disabled_reason', { length: 255 }),
    disabledAt: datetime('disabled_at', { mode: 'date', fsp: 3 }),
    fingerprint: char('fingerprint', { length: 16 }),
    reportedFingerprint: char('reported_fingerprint', { length: 16 }),
    fingerprintMismatch: boolean('fingerprint_mismatch').notNull().default(false),
    hostname: varchar('hostname', { length: 255 }),
    appVersion: varchar('app_version', { length: 40 }),
    ip: varchar('ip', { length: 64 }),
    mode: varchar('mode', { length: 16 }),
    screen: varchar('screen', { length: 64 }),
    currentRevision: int('current_revision').notNull().default(0),
    appliedRevision: int('applied_revision'),
    /** Last manifest revision this kiosk downloaded; set = it can draw uploaded templates. */
    manifestRevision: int('manifest_revision'),
    /** Last rejected revision (the kiosk kept its previous settings), cleared by the next applied ack. */
    configError: jsonText<{ revision: number; code?: string; message: string; at: string }>('config_error'),
    maintenance: boolean('maintenance').notNull().default(false),
    queueDepth: int('queue_depth').notNull().default(0),
    printerState: jsonText<PrinterState[]>('printer_state'),
    cameraState: jsonText<CameraState>('camera_state'),
    localSettings: jsonText<Record<string, unknown>>('local_settings'),
    /** Settings preset ("งาน") this kiosk follows; null = the customer's defaults (ค่ากลาง). */
    eventId: id('event_id'),
    /** Config sections (lib/config-permissions) set on this kiosk itself; the rest follow the event / defaults. null = every section (kiosks from before presets). */
    ownSections: jsonText<string[]>('own_sections'),
    /** Emergency mode reported by the kiosk (Admin-owned settings unlocked with the PIN); null = off. */
    emergency: jsonText<{ since: string; changes: { key: string; value: unknown }[] }>('emergency'),
    lastSeenAt: datetime('last_seen_at', { mode: 'date', fsp: 3 }),
    pairedAt: datetime('paired_at', { mode: 'date', fsp: 3 }),
    revokedAt: datetime('revoked_at', { mode: 'date', fsp: 3 }),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (t) => [
    uniqueIndex('kiosks_kiosk_id_uq').on(t.kioskId), // MariaDB allows many NULLs in a UNIQUE index
    index('kiosks_org_idx').on(t.orgId, t.status),
    index('kiosks_org_branch_idx').on(t.orgId, t.branchId)
  ]
);

/** Only the hash of a pairing code is stored; the code itself is shown once to the admin. */
export const kioskPairCodes = mysqlTable(
  'kiosk_pair_codes',
  {
    id: id().primaryKey(),
    orgId: id('org_id').notNull(),
    kioskRowId: id('kiosk_row_id').notNull(),
    codeHash: char('code_hash', { length: 64 }).notNull(),
    expiresAt: datetime('expires_at', { mode: 'date', fsp: 3 }).notNull(),
    usedAt: datetime('used_at', { mode: 'date', fsp: 3 }),
    createdBy: id('created_by'),
    createdAt: createdAt()
  },
  (t) => [uniqueIndex('kiosk_pair_codes_hash_uq').on(t.codeHash), index('kiosk_pair_codes_kiosk_idx').on(t.kioskRowId)]
);

export const kioskTokens = mysqlTable(
  'kiosk_tokens',
  {
    id: id().primaryKey(),
    orgId: id('org_id').notNull(),
    kioskRowId: id('kiosk_row_id').notNull(),
    tokenHash: char('token_hash', { length: 64 }).notNull(),
    createdAt: createdAt(),
    lastUsedAt: datetime('last_used_at', { mode: 'date', fsp: 3 }),
    revokedAt: datetime('revoked_at', { mode: 'date', fsp: 3 })
  },
  (t) => [uniqueIndex('kiosk_tokens_hash_uq').on(t.tokenHash), index('kiosk_tokens_kiosk_idx').on(t.kioskRowId)]
);

/** Append-only settings history per kiosk; `kiosks.current_revision` points at the latest. */
export const kioskConfigRevisions = mysqlTable(
  'kiosk_config_revisions',
  {
    kioskRowId: id('kiosk_row_id').notNull(),
    revision: int('revision').notNull(),
    orgId: id('org_id').notNull(),
    settings: jsonText<unknown>('settings').notNull(),
    note: varchar('note', { length: 255 }).notNull().default(''),
    createdBy: id('created_by'),
    createdAt: createdAt()
  },
  (t) => [primaryKey({ columns: [t.kioskRowId, t.revision] }), index('kiosk_config_org_idx').on(t.orgId)]
);

/** The customer's default kiosk settings (ค่ากลาง): kiosks without an event follow it, new events start from it. */
export const orgConfigDefaults = mysqlTable('org_config_defaults', {
  orgId: id('org_id').primaryKey(),
  settings: jsonText<unknown>('settings').notNull(),
  updatedBy: id('updated_by'),
  updatedAt: updatedAt()
});

/** A settings preset ("งาน") several kiosks follow, e.g. one wedding or fair. */
export const configEvents = mysqlTable(
  'config_events',
  {
    id: id().primaryKey(),
    orgId: id('org_id').notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    note: varchar('note', { length: 500 }).notNull().default(''),
    settings: jsonText<unknown>('settings').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdBy: id('created_by'),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (t) => [index('config_events_org_idx').on(t.orgId, t.isActive)]
);

/** Fixed-window counters for rate limiting (pairing attempts per IP, Kiosk API per device). */
export const rateLimits = mysqlTable('rate_limits', {
  key: varchar('key', { length: 128 }).primaryKey(),
  windowStart: datetime('window_start', { mode: 'date', fsp: 3 }).notNull(),
  count: int('count').notNull()
});

export const configAcks = mysqlTable(
  'config_acks',
  {
    id: id().primaryKey(),
    orgId: id('org_id').notNull(),
    kioskRowId: id('kiosk_row_id').notNull(),
    revision: int('revision').notNull(),
    status: mysqlEnum('status', ['applied', 'rejected']).notNull(),
    error: jsonText<{ code?: string; message: string }>('error'),
    appliedAt: datetime('applied_at', { mode: 'date', fsp: 3 }),
    receivedAt: datetime('received_at', { mode: 'date', fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`)
  },
  (t) => [index('config_acks_kiosk_idx').on(t.kioskRowId, t.revision)]
);

// ─── Customer storage (Phase 2) ──────────────────────────────────────────────

/**
 * Each customer gets its own R2 bucket and a token scoped to that bucket, so one
 * customer's kiosks can never read another customer's photos. Keys are stored encrypted
 * (MASTER_KEY) and reach kiosks only inside sealed config secrets.
 */
export const orgStorage = mysqlTable('org_storage', {
  orgId: id('org_id').primaryKey(),
  accountId: varchar('account_id', { length: 64 }).notNull(),
  bucket: varchar('bucket', { length: 63 }).notNull(),
  endpoint: varchar('endpoint', { length: 255 }).notNull().default(''),
  publicUrl: varchar('public_url', { length: 255 }).notNull(),
  accessKeyIdEnc: text('access_key_id_enc').notNull(),
  secretAccessKeyEnc: text('secret_access_key_enc').notNull(),
  keyHint: varchar('key_hint', { length: 16 }).notNull().default(''),
  lifecycleDays: int('lifecycle_days').notNull().default(7),
  /** Bumped on every change; kiosks receive the new keys with the next config revision. */
  secretsVersion: int('secrets_version').notNull().default(1),
  lastTestAt: datetime('last_test_at', { mode: 'date', fsp: 3 }),
  lastTestOk: boolean('last_test_ok'),
  lastTestError: varchar('last_test_error', { length: 500 }),
  updatedBy: id('updated_by'),
  updatedAt: updatedAt()
});

// ─── Orders (docs §18) ───────────────────────────────────────────────────────

export const ORDER_STATUSES = ['uploaded', 'printed_at_kiosk', 'claimed', 'handed_over', 'expired', 'cancelled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/**
 * Every sale a kiosk makes. `pickup` orders carry the 6-character code printed on the slip
 * and wait at the pickup counter; `kiosk` orders were printed at the booth. Images stay in
 * the customer's R2 bucket; only their URLs are kept here.
 */
export const orders = mysqlTable(
  'orders',
  {
    id: id().primaryKey(),
    orgId: id('org_id').notNull(),
    branchId: id('branch_id'),
    kioskRowId: id('kiosk_row_id').notNull(),
    /** The kiosk's own id for this order: makes POST /orders safe to retry. */
    clientOrderId: varchar('client_order_id', { length: 64 }).notNull(),
    code: char('code', { length: 6 }),
    mode: varchar('mode', { length: 16 }).notNull(),
    product: varchar('product', { length: 40 }).notNull(),
    templateId: varchar('template_id', { length: 64 }),
    badge: jsonText<{ size: string; copies: number; frame: string; cutMm?: number } | null>('badge'),
    items: jsonText<{ type: 'photo' | 'badge' | 'print'; qty: number }[]>('items').notNull(),
    amountSatang: int('amount_satang').notNull().default(0),
    paymentKind: mysqlEnum('payment_kind', ['live', 'test', 'simulated', 'free']).notNull(),
    paymentRef: varchar('payment_ref', { length: 80 }),
    /** Problems noticed when the kiosk reported the order, e.g. 'live_not_allowed'. */
    flags: jsonText<string[]>('flags'),
    fulfillment: mysqlEnum('fulfillment', ['kiosk', 'pickup']).notNull(),
    status: mysqlEnum('status', ORDER_STATUSES).notNull(),
    downloadUrl: varchar('download_url', { length: 1000 }),
    orderedAt: datetime('ordered_at', { mode: 'date', fsp: 3 }).notNull(),
    receivedAt: datetime('received_at', { mode: 'date', fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
    expiresAt: datetime('expires_at', { mode: 'date', fsp: 3 }),
    printedAt: datetime('printed_at', { mode: 'date', fsp: 3 }),
    claimedAt: datetime('claimed_at', { mode: 'date', fsp: 3 }),
    claimedBy: id('claimed_by'),
    claimedStation: varchar('claimed_station', { length: 60 }),
    handedOverAt: datetime('handed_over_at', { mode: 'date', fsp: 3 }),
    reprintAllowance: int('reprint_allowance').notNull().default(0)
  },
  (t) => [
    uniqueIndex('orders_code_uq').on(t.code), // NULL for kiosk-printed orders; MariaDB allows many NULLs
    uniqueIndex('orders_client_uq').on(t.kioskRowId, t.clientOrderId),
    index('orders_org_time_idx').on(t.orgId, t.orderedAt),
    index('orders_org_status_idx').on(t.orgId, t.status, t.orderedAt)
  ]
);

export const orderFiles = mysqlTable(
  'order_files',
  {
    id: id().primaryKey(),
    orderId: id('order_id').notNull(),
    orgId: id('org_id').notNull(),
    kind: mysqlEnum('kind', ['photo', 'badge', 'shot', 'ai', 'receipt']).notNull(),
    url: varchar('url', { length: 1000 }).notNull(),
    r2Key: varchar('r2_key', { length: 500 }),
    width: int('width'),
    height: int('height')
  },
  (t) => [index('order_files_order_idx').on(t.orderId)]
);

// ─── Template catalog (docs §18.6) ───────────────────────────────────────────

/**
 * Status of every template the platform offers. Built-ins come from packages/catalog (one
 * row each, created on demand); uploaded templates arrive in Phase 7. Retired templates
 * vanish from customers' galleries and from kiosks at their next settings revision.
 */
export const catalogTemplates = mysqlTable(
  'catalog_templates',
  {
    id: varchar('id', { length: 64 }).notNull(),
    kind: mysqlEnum('kind', ['photo-4x6', 'badge', 'classic', 'ai-scene']).notNull(),
    source: mysqlEnum('source', ['builtin', 'uploaded']).notNull().default('builtin'),
    /** draft = uploaded but never published (kiosks and customers do not see it). */
    status: mysqlEnum('status', ['draft', 'published', 'retired']).notNull().default('published'),
    /** Uploaded templates only (built-in names come from the kiosk catalog). */
    name: varchar('name', { length: 80 }),
    description: varchar('description', { length: 300 }),
    tags: jsonText<string[]>('tags'),
    publishedVersion: int('published_version'),
    createdBy: id('created_by'),
    createdAt: datetime('created_at', { mode: 'date', fsp: 3 }),
    updatedBy: id('updated_by'),
    updatedAt: updatedAt()
  },
  (t) => [primaryKey({ columns: [t.kind, t.id] })]
);

/** Versions of an uploaded template. A published version is never edited: edits make a new one. */
export const templateVersions = mysqlTable(
  'template_versions',
  {
    id: id().primaryKey(),
    kind: mysqlEnum('kind', ['photo-4x6', 'badge', 'classic', 'ai-scene']).notNull(),
    templateId: varchar('template_id', { length: 64 }).notNull(),
    version: int('version').notNull(),
    spec: jsonText<TemplateSpec>('spec').notNull(),
    files: jsonText<TemplateFiles>('files').notNull(),
    note: varchar('note', { length: 200 }),
    createdBy: id('created_by'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    publishedAt: datetime('published_at', { mode: 'date', fsp: 3 })
  },
  (t) => [uniqueIndex('template_versions_uq').on(t.kind, t.templateId, t.version)]
);

/** Immutable files of the central catalog, named by their sha256. */
export const catalogAssets = mysqlTable('catalog_assets', {
  sha256: char('sha256', { length: 64 }).primaryKey(),
  storageKey: varchar('storage_key', { length: 200 }).notNull(),
  contentType: varchar('content_type', { length: 40 }).notNull(),
  bytes: int('bytes').notNull(),
  width: int('width'),
  height: int('height'),
  createdBy: id('created_by'),
  createdAt: createdAt()
});

/** Single row (id = 1): bumped whenever the set of published uploaded templates changes. */
export const catalogState = mysqlTable('catalog_state', {
  id: int('id').primaryKey(),
  manifestRevision: int('manifest_revision').notNull().default(0),
  updatedAt: updatedAt()
});

export type TemplateVersion = typeof templateVersions.$inferSelect;
export type CatalogTemplate = typeof catalogTemplates.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderFile = typeof orderFiles.$inferSelect;
export type OrgStorage = typeof orgStorage.$inferSelect;
export type KioskConfigRevision = typeof kioskConfigRevisions.$inferSelect;
export type Kiosk = typeof kiosks.$inferSelect;
export type Organization = typeof organizations.$inferSelect;
export type User = typeof users.$inferSelect;
export type Branch = typeof branches.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
