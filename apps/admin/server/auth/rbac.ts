import type { OrgRole, PlatformRole } from '@/server/db/schema';

/**
 * Two levels of roles (docs/ADMIN_SYSTEM_DESIGN.md §3.2):
 *  - platform roles belong to our own team and work across every customer
 *  - org roles belong to one customer (membership)
 * `can()` is the only place permissions are decided; UI and server both call it.
 */

export const ORG_ACTIONS = [
  'org.view',
  'org.settings',
  'member.view',
  'member.manage',
  'branch.view',
  'branch.manage',
  'audit.view',
  'kiosk.view',
  'kiosk.manage',
  'kiosk.command',
  'config.edit',
  'template.manage',
  'order.view',
  'order.reprint',
  'payment.view',
  /** Refund a customer's payment through Stripe (owner, manager, platform admin). */
  'payment.refund',
  'report.view',
  'log.view',
  'pickup.use',
  /** Event Console (realtime kiosks, print queue, photos) and its actions (reprint / cancel). */
  'console.view',
  'console.act'
] as const;
export type OrgAction = (typeof ORG_ACTIONS)[number];

export const PLATFORM_ACTIONS = ['platform.view', 'platform.org.manage', 'platform.secrets', 'platform.catalog'] as const;
export type PlatformAction = (typeof PLATFORM_ACTIONS)[number];

const VIEW_ONLY: OrgAction[] = ['org.view', 'member.view', 'branch.view', 'audit.view', 'kiosk.view', 'order.view', 'payment.view', 'report.view', 'log.view'];

const ORG_MATRIX: Record<OrgRole, readonly OrgAction[]> = {
  owner: ORG_ACTIONS,
  manager: [
    'org.view', 'member.view', 'branch.view', 'audit.view',
    'kiosk.view', 'kiosk.manage', 'kiosk.command', 'config.edit', 'template.manage',
    'order.view', 'order.reprint', 'payment.view', 'payment.refund', 'report.view', 'log.view', 'pickup.use',
    'console.view', 'console.act'
  ],
  designer: ['org.view', 'template.manage', 'kiosk.view'],
  pickup_staff: ['org.view', 'pickup.use', 'order.view'],
  /** On-site staff: the Event Console of their branches only (no sales totals, no settings). */
  event_staff: ['org.view', 'console.view', 'console.act'],
  viewer: ['org.view', 'branch.view', 'kiosk.view', 'order.view', 'report.view']
};

/** Actions a platform user gets inside any customer's space (support access). */
const PLATFORM_IN_ORG: Record<PlatformRole, readonly OrgAction[]> = {
  platform_admin: ORG_ACTIONS,
  platform_support: [...VIEW_ONLY, 'kiosk.command']
};

const PLATFORM_MATRIX: Record<PlatformRole, readonly PlatformAction[]> = {
  platform_admin: PLATFORM_ACTIONS,
  platform_support: ['platform.view']
};

/** Actions that are limited to the branches a manager/pickup user was given. */
const BRANCH_SCOPED = new Set<OrgAction>(['kiosk.view', 'kiosk.manage', 'kiosk.command', 'config.edit', 'order.view', 'order.reprint', 'pickup.use', 'console.view', 'console.act']);

export interface Principal {
  platformRole: PlatformRole | null;
  /** Membership role in the current org; null when a platform user acts as support. */
  orgRole: OrgRole | null;
  /** 'all' or the branch ids the membership is limited to. */
  branches: 'all' | readonly string[];
}

export function can(p: Principal, action: OrgAction, scope?: { branchId?: string | null }): boolean {
  const allowed = p.orgRole ? ORG_MATRIX[p.orgRole].includes(action) : false;
  const viaPlatform = p.platformRole ? PLATFORM_IN_ORG[p.platformRole].includes(action) : false;
  if (!allowed && !viaPlatform) return false;
  if (viaPlatform) return true; // platform access is never branch-limited
  if (scope?.branchId && BRANCH_SCOPED.has(action) && p.branches !== 'all') {
    return p.branches.includes(scope.branchId);
  }
  return true;
}

export function canPlatform(role: PlatformRole | null, action: PlatformAction): boolean {
  return role ? PLATFORM_MATRIX[role].includes(action) : false;
}

export const ORG_ROLE_LABELS: Record<OrgRole, string> = {
  owner: 'เจ้าของ',
  manager: 'ผู้จัดการ',
  designer: 'นักออกแบบ',
  pickup_staff: 'พนักงานจุดรับรูป',
  event_staff: 'พนักงานหน้างาน',
  viewer: 'ผู้ดูรายงาน'
};

export const PLATFORM_ROLE_LABELS: Record<PlatformRole, string> = {
  platform_admin: 'ผู้ดูแลแพลตฟอร์ม',
  platform_support: 'ทีมซัพพอร์ต'
};
