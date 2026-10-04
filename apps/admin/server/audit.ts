import 'server-only';
import { db } from '@/server/db/client';
import { auditLogs } from '@/server/db/schema';
import { newId } from '@/server/lib/ids';
import { requestMeta, type SessionUser } from '@/server/auth/session';

export interface AuditEntry {
  action: string; // e.g. 'branch.create', 'member.role_change', 'org.suspend'
  resourceType: string;
  resourceId?: string | null;
  before?: unknown;
  after?: unknown;
}

/** Records who did what. `orgId` null = a platform-level action. Never pass secrets in before/after. */
export async function audit(
  actor: { user: SessionUser; orgId: string | null; actingAsPlatform?: boolean },
  entry: AuditEntry
): Promise<void> {
  const { ip } = await requestMeta();
  await db().insert(auditLogs).values({
    id: newId('aud'),
    orgId: actor.orgId,
    userId: actor.user.id,
    actingAsPlatform: actor.actingAsPlatform ?? false,
    action: entry.action,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
    ip
  });
}
