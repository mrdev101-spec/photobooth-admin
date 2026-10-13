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
import { jsonText, mediumBlob } from './json-text';
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

export const ORG_ROLES = ['owner', 'manager', 'designer', 'pickup_staff', 'event_staff', 'viewer'] as const;
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
    /** 'stock' = the platform's own kiosk stock (คลังตู้): kiosks not given to a customer yet. Never listed as a customer. */
    kind: mysqlEnum('kind', ['customer', 'stock']).notNull().default('customer'),
    kioskQuota: int('kiosk_quota').default(5), // NULL = unlimited
    userQuota: int('user_quota').default(3), // customer members; NULL = unlimited (decision D14)
    aiMonthlyQuota: int('ai_monthly_quota').default(300), // images per month (new shops 300); NULL = unlimited, set only on purpose by the platform
    /** Templates the customer may upload itself (drafts + published); 0 = off, NULL = unlimited. */
    templateQuota: int('template_quota').default(0),
    /** Customers may add / pair / unpair kiosks themselves (decision D12: off, the platform does it). */
    customerCanAddKiosks: boolean('customer_can_add_kiosks').notNull().default(false),
    /** Per-section kiosk settings permissions (lib/config-permissions.ts); NULL = defaults. */
    configPermissions: jsonText<Record<string, string>>('config_permissions'),
    livePaymentsAllowed: boolean('live_payments_allowed').notNull().default(false),
    /** The platform lets this customer take payments into its own Stripe account (set up by the owner). */
    ownStripeAllowed: boolean('own_stripe_allowed').notNull().default(false),
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

/**
 * Email sign-in codes (2FA for the platform team and shop owners). The browser holds a random
 * challenge token (cookie); only hashes of the token and the 6-digit code are stored.
 */
export const loginChallenges = mysqlTable(
  'login_challenges',
  {
    id: id('id').primaryKey(),
    tokenHash: char('token_hash', { length: 64 }).notNull(),
    userId: id('user_id').notNull(),
    codeHash: char('code_hash', { length: 64 }).notNull(),
    attempts: int('attempts').notNull().default(0),
    sentCount: int('sent_count').notNull().default(1),
    expiresAt: datetime('expires_at', { mode: 'date', fsp: 3 }).notNull(),
    createdAt: createdAt()
  },
  (t) => [uniqueIndex('login_challenges_token_uq').on(t.tokenHash), index('login_challenges_user_idx').on(t.userId)]
);

/** Browsers a user chose to remember after an email code (30 days, no code needed). */
export const trustedDevices = mysqlTable(
  'trusted_devices',
  {
    id: id('id').primaryKey(),
    tokenHash: char('token_hash', { length: 64 }).notNull(),
    userId: id('user_id').notNull(),
    userAgent: varchar('user_agent', { length: 255 }),
    expiresAt: datetime('expires_at', { mode: 'date', fsp: 3 }).notNull(),
    createdAt: createdAt()
  },
  (t) => [uniqueIndex('trusted_devices_token_uq').on(t.tokenHash), index('trusted_devices_user_idx').on(t.userId)]
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
    /**
     * Retired ("ยกเลิกตู้"): unpaired for good and kept as history (its sales, settings and audit
     * stay); hidden from the kiosk lists, the Event Console and the quota. null = in use.
     */
    archivedAt: datetime('archived_at', { mode: 'date', fsp: 3 }),
    archivedReason: varchar('archived_reason', { length: 255 }),
    archivedBy: id('archived_by'),
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
    /** 'pair' = 8-character code for 15 minutes; 'key' = 12-character activation key from the platform (30 days). */
    kind: mysqlEnum('kind', ['pair', 'key']).notNull().default('pair'),
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
    reprintAllowance: int('reprint_allowance').notNull().default(0),
    /** Queue number printed on the slip and the sheet (A001 …), per kiosk per day. */
    queueNo: varchar('queue_no', { length: 16 }),
    /** The settings preset (งาน) the kiosk followed when the order came in. */
    eventId: id('event_id'),
    /** A small JPEG of the order exists in order_thumbs (Event Console). */
    hasThumb: boolean('has_thumb').notNull().default(false)
  },
  (t) => [
    uniqueIndex('orders_code_uq').on(t.code), // NULL for kiosk-printed orders; MariaDB allows many NULLs
    uniqueIndex('orders_client_uq').on(t.kioskRowId, t.clientOrderId),
    index('orders_org_time_idx').on(t.orgId, t.orderedAt),
    index('orders_org_status_idx').on(t.orgId, t.status, t.orderedAt)
  ]
);

/**
 * What the kiosk printed for an order, job by job (photo sheet, badge sheet, queue slip), as the
 * kiosk reports it (Event Console). One row per kiosk job id; the latest status wins.
 */
export const PRINT_JOB_STATUSES = ['queued', 'printing', 'printed', 'failed', 'cancelled'] as const;
export const printJobs = mysqlTable(
  'print_jobs',
  {
    id: id().primaryKey(),
    orgId: id('org_id').notNull(),
    kioskRowId: id('kiosk_row_id').notNull(),
    orderId: id('order_id').notNull(),
    clientJobId: varchar('client_job_id', { length: 64 }).notNull(),
    kind: mysqlEnum('kind', ['photo', 'badge', 'slip']).notNull(),
    status: mysqlEnum('status', PRINT_JOB_STATUSES).notNull(),
    printer: varchar('printer', { length: 200 }),
    error: varchar('error', { length: 500 }),
    attempts: int('attempts').notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    printedAt: datetime('printed_at', { mode: 'date', fsp: 3 })
  },
  (t) => [uniqueIndex('print_jobs_client_uq').on(t.kioskRowId, t.clientJobId), index('print_jobs_org_time_idx').on(t.orgId, t.createdAt), index('print_jobs_order_idx').on(t.orderId)]
);

/**
 * Commands for one kiosk (Event Console: reprint an order, cancel what is still waiting in the
 * printer queue). Delivered through GET /kiosk/wait within a second or two; the kiosk reports
 * the result. Pending commands the kiosk never picks up expire.
 */
export const kioskCommands = mysqlTable(
  'kiosk_commands',
  {
    id: id().primaryKey(),
    orgId: id('org_id').notNull(),
    kioskRowId: id('kiosk_row_id').notNull(),
    type: mysqlEnum('type', ['reprint', 'cancel_print']).notNull(),
    payload: jsonText<Record<string, unknown>>('payload').notNull(),
    status: mysqlEnum('status', ['pending', 'sent', 'done', 'failed']).notNull().default('pending'),
    message: varchar('message', { length: 500 }),
    createdBy: id('created_by'),
    createdAt: createdAt(),
    sentAt: datetime('sent_at', { mode: 'date', fsp: 3 }),
    doneAt: datetime('done_at', { mode: 'date', fsp: 3 })
  },
  (t) => [index('kiosk_commands_kiosk_idx').on(t.kioskRowId, t.status), index('kiosk_commands_org_idx').on(t.orgId, t.createdAt)]
);

/** Small JPEG of each order for the Event Console (customer photos: served only to the shop). */
export const orderThumbs = mysqlTable('order_thumbs', {
  orderId: id('order_id').primaryKey(),
  orgId: id('org_id').notNull(),
  jpeg: mediumBlob('jpeg').notNull(),
  createdAt: createdAt()
});

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
    /** Uploaded by a customer for its own kiosks only; NULL = the platform's (every customer). */
    orgId: id('org_id'),
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

// ─── AI through the Admin (docs §8.5) ────────────────────────────────────────

export const AI_PROVIDER_SETTINGS = ['auto', 'openai', 'openrouter', 'google'] as const;

/**
 * Single row (id = 1): the platform's AI account. One key per provider for every customer;
 * keys are encrypted (MASTER_KEY) and never leave the Admin, kiosks send photos here instead.
 */
export const platformAiSettings = mysqlTable('platform_ai_settings', {
  id: int('id').primaryKey(),
  provider: mysqlEnum('provider', AI_PROVIDER_SETTINGS).notNull().default('auto'),
  openaiKeyEnc: text('openai_key_enc'),
  openrouterKeyEnc: text('openrouter_key_enc'),
  googleKeyEnc: text('google_key_enc'),
  openaiKeyHint: varchar('openai_key_hint', { length: 16 }).notNull().default(''),
  openrouterKeyHint: varchar('openrouter_key_hint', { length: 16 }).notNull().default(''),
  googleKeyHint: varchar('google_key_hint', { length: 16 }).notNull().default(''),
  openaiModel: varchar('openai_model', { length: 80 }),
  openrouterModel: varchar('openrouter_model', { length: 80 }),
  googleModel: varchar('google_model', { length: 80 }),
  thaiTextModel: varchar('thai_text_model', { length: 80 }),
  imageSize: mysqlEnum('image_size', ['1K', '2K']).notNull().default('1K'),
  faceRefine: boolean('face_refine').notNull().default(true),
  lastTestAt: datetime('last_test_at', { mode: 'date', fsp: 3 }),
  lastTestOk: boolean('last_test_ok'),
  lastTestMessage: varchar('last_test_message', { length: 500 }),
  updatedBy: id('updated_by'),
  updatedAt: updatedAt()
});

export const AI_JOB_STATUSES = ['queued', 'running', 'succeeded', 'failed'] as const;

/** One customer image request from a kiosk. Rows are kept (no images) for usage and support. */
export const aiJobs = mysqlTable(
  'ai_jobs',
  {
    id: id().primaryKey(),
    orgId: id('org_id').notNull(),
    kioskRowId: id('kiosk_row_id').notNull(),
    /** The kiosk's id for this request: a retried POST returns the same job. */
    requestId: varchar('request_id', { length: 64 }).notNull(),
    sceneId: varchar('scene_id', { length: 64 }).notNull(),
    /** The payment this image used (null = the kiosk does not charge: free use / simulated). */
    paymentId: id('payment_id'),
    status: mysqlEnum('status', AI_JOB_STATUSES).notNull().default('queued'),
    provider: varchar('provider', { length: 20 }),
    model: varchar('model', { length: 80 }),
    imageSize: varchar('image_size', { length: 4 }),
    refined: boolean('refined').notNull().default(false),
    errorCode: varchar('error_code', { length: 16 }),
    errorDetail: varchar('error_detail', { length: 500 }),
    durationMs: int('duration_ms'),
    /** Calendar month of the request (Asia/Bangkok), the quota period it counts in. */
    month: char('month', { length: 7 }).notNull(),
    createdAt: createdAt(),
    startedAt: datetime('started_at', { mode: 'date', fsp: 3 }),
    finishedAt: datetime('finished_at', { mode: 'date', fsp: 3 })
  },
  (t) => [
    uniqueIndex('ai_jobs_request_uq').on(t.kioskRowId, t.requestId),
    index('ai_jobs_org_month_idx').on(t.orgId, t.month, t.status),
    index('ai_jobs_status_idx').on(t.status, t.createdAt)
  ]
);

/** The images of a job while it runs: the customer photo goes when the job ends, the result after 1 hour. */
export const aiJobFiles = mysqlTable(
  'ai_job_files',
  {
    jobId: id('job_id').notNull(),
    role: mysqlEnum('role', ['photo', 'crop', 'result']).notNull(),
    mimeType: varchar('mime_type', { length: 20 }).notNull(),
    bytes: mediumBlob('bytes').notNull(),
    createdAt: createdAt()
  },
  (t) => [primaryKey({ columns: [t.jobId, t.role] })]
);

/**
 * Photos a customer sends from a phone to a kiosk (QR → /u/{token}). Kept only until the kiosk
 * takes them (then deleted); a session lasts 10 minutes. The token is stored hashed.
 */
export const phoneUploads = mysqlTable(
  'phone_uploads',
  {
    id: id().primaryKey(),
    orgId: id('org_id').notNull(),
    kioskRowId: id('kiosk_row_id').notNull(),
    tokenHash: char('token_hash', { length: 64 }).notNull(),
    count: int('count').notNull(),
    received: int('received').notNull().default(0),
    status: mysqlEnum('status', ['waiting', 'uploading', 'ready', 'taken', 'cancelled']).notNull().default('waiting'),
    expiresAt: datetime('expires_at', { mode: 'date', fsp: 3 }).notNull(),
    createdAt: createdAt()
  },
  (t) => [uniqueIndex('phone_uploads_token_uq').on(t.tokenHash), index('phone_uploads_expires_idx').on(t.expiresAt)]
);

export const phoneUploadFiles = mysqlTable(
  'phone_upload_files',
  {
    uploadId: id('upload_id').notNull(),
    idx: int('idx').notNull(),
    mimeType: varchar('mime_type', { length: 20 }).notNull(),
    bytes: mediumBlob('bytes').notNull(),
    createdAt: createdAt()
  },
  (t) => [primaryKey({ columns: [t.uploadId, t.idx] })]
);

/** Images customers received per customer per month (the quota counter). */
export const aiUsageMonthly = mysqlTable(
  'ai_usage_monthly',
  {
    orgId: id('org_id').notNull(),
    month: char('month', { length: 7 }).notNull(),
    images: int('images').notNull().default(0),
    failed: int('failed').notNull().default(0),
    updatedAt: updatedAt()
  },
  (t) => [primaryKey({ columns: [t.orgId, t.month] })]
);

// ─── Payments through the Admin (docs §8.4) ──────────────────────────────────

/**
 * Single row (id = 1): the company's Stripe account, used for every customer that has no
 * account of its own. Keys are encrypted (MASTER_KEY) and never reach kiosks.
 */
export const platformPaymentSettings = mysqlTable('platform_payment_settings', {
  id: int('id').primaryKey(),
  testSecretEnc: text('test_secret_enc'),
  testWebhookEnc: text('test_webhook_enc'),
  liveSecretEnc: text('live_secret_enc'),
  liveWebhookEnc: text('live_webhook_enc'),
  /** Stripe restricted key (rk_…, PaymentIntents only) kiosks use while the Admin is unreachable. */
  testKioskKeyEnc: text('test_kiosk_key_enc'),
  liveKioskKeyEnc: text('live_kiosk_key_enc'),
  testKioskKeyHint: varchar('test_kiosk_key_hint', { length: 8 }).notNull().default(''),
  liveKioskKeyHint: varchar('live_kiosk_key_hint', { length: 8 }).notNull().default(''),
  testSecretHint: varchar('test_secret_hint', { length: 16 }).notNull().default(''),
  liveSecretHint: varchar('live_secret_hint', { length: 16 }).notNull().default(''),
  /** Stripe needs a payer email for PromptPay; the company's is used. */
  email: varchar('email', { length: 200 }).notNull().default(''),
  lastTestAt: datetime('last_test_at', { mode: 'date', fsp: 3 }),
  lastTestOk: boolean('last_test_ok'),
  lastTestMessage: varchar('last_test_message', { length: 500 }),
  lastWebhookAt: datetime('last_webhook_at', { mode: 'date', fsp: 3 }),
  updatedBy: id('updated_by'),
  updatedAt: updatedAt()
});

/**
 * A customer's own Stripe account (only when the platform allows it). `keys` = the owner
 * entered its keys; `connect` = linked with Stripe Connect (account id, no keys stored).
 */
export const orgPaymentAccounts = mysqlTable('org_payment_accounts', {
  orgId: id('org_id').primaryKey(),
  /** Off = the customer is back on the company account (keys are kept). */
  active: boolean('active').notNull().default(false),
  method: mysqlEnum('method', ['keys', 'connect']).notNull().default('keys'),
  testSecretEnc: text('test_secret_enc'),
  testWebhookEnc: text('test_webhook_enc'),
  liveSecretEnc: text('live_secret_enc'),
  liveWebhookEnc: text('live_webhook_enc'),
  /** Stripe restricted key (rk_…, PaymentIntents only) kiosks use while the Admin is unreachable. */
  testKioskKeyEnc: text('test_kiosk_key_enc'),
  liveKioskKeyEnc: text('live_kiosk_key_enc'),
  testKioskKeyHint: varchar('test_kiosk_key_hint', { length: 8 }).notNull().default(''),
  liveKioskKeyHint: varchar('live_kiosk_key_hint', { length: 8 }).notNull().default(''),
  testSecretHint: varchar('test_secret_hint', { length: 16 }).notNull().default(''),
  liveSecretHint: varchar('live_secret_hint', { length: 16 }).notNull().default(''),
  connectAccountId: varchar('connect_account_id', { length: 64 }),
  email: varchar('email', { length: 200 }).notNull().default(''),
  accountName: varchar('account_name', { length: 120 }),
  lastTestAt: datetime('last_test_at', { mode: 'date', fsp: 3 }),
  lastTestOk: boolean('last_test_ok'),
  lastTestMessage: varchar('last_test_message', { length: 500 }),
  lastWebhookAt: datetime('last_webhook_at', { mode: 'date', fsp: 3 }),
  updatedBy: id('updated_by'),
  updatedAt: updatedAt()
});

export const PAYMENT_STATUSES = ['requires_action', 'processing', 'succeeded', 'canceled', 'failed', 'refunded'] as const;

/** One PromptPay payment from a kiosk. `account` says whose Stripe account received the money. */
export const payments = mysqlTable(
  'payments',
  {
    id: id().primaryKey(),
    orgId: id('org_id').notNull(),
    kioskRowId: id('kiosk_row_id').notNull(),
    branchId: id('branch_id'),
    account: mysqlEnum('account', ['platform', 'shop']).notNull(),
    mode: mysqlEnum('mode', ['test', 'live']).notNull(),
    stripeIntentId: varchar('stripe_intent_id', { length: 64 }).notNull(),
    /** Stripe Connect account the payment was made on (null = keys of the company / the shop). */
    stripeAccountId: varchar('stripe_account_id', { length: 64 }),
    amount: int('amount').notNull(), // THB
    product: varchar('product', { length: 100 }).notNull().default(''),
    description: varchar('description', { length: 200 }).notNull().default(''),
    status: mysqlEnum('status', PAYMENT_STATUSES).notNull().default('requires_action'),
    confirmedBy: mysqlEnum('confirmed_by', ['webhook', 'poll']),
    /** Stripe's fee and the net amount in satang, from the balance transaction (when known). */
    feeSatang: int('fee_satang'),
    netSatang: int('net_satang'),
    /** What used this payment (one AI image, …): a payment pays for one thing only. */
    usedBy: varchar('used_by', { length: 40 }),
    expiresAt: datetime('expires_at', { mode: 'date', fsp: 3 }).notNull(),
    paidAt: datetime('paid_at', { mode: 'date', fsp: 3 }),
    /** Refund made from the Admin (full amount): Stripe refund id, who and why. */
    refundedAt: datetime('refunded_at', { mode: 'date', fsp: 3 }),
    refundId: varchar('refund_id', { length: 64 }),
    refundedBy: varchar('refunded_by', { length: 40 }),
    refundReason: varchar('refund_reason', { length: 200 }),
    /** Stripe's refund status: succeeded, pending, or requires_action (PromptPay: waiting for the customer's bank details). */
    refundStatus: varchar('refund_status', { length: 20 }),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (t) => [
    uniqueIndex('payments_intent_uq').on(t.stripeIntentId),
    uniqueIndex('payments_used_by_uq').on(t.usedBy),
    index('payments_org_idx').on(t.orgId, t.createdAt),
    index('payments_status_idx').on(t.status, t.expiresAt)
  ]
);

export type Payment = typeof payments.$inferSelect;
export type OrgPaymentAccount = typeof orgPaymentAccounts.$inferSelect;
export type PlatformPaymentSettings = typeof platformPaymentSettings.$inferSelect;
export type AiJob = typeof aiJobs.$inferSelect;
export type PlatformAiSettings = typeof platformAiSettings.$inferSelect;
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
