import type { Metadata } from 'next';
import { requireOrg } from '@/server/auth/context';
import { AUDIT_PAGE_SIZE, listOrgAudit } from '@/server/services/audit-log';
import { AuditTable } from '@/components/audit-table';
import { PageHeader } from '@/components/ui';

export const metadata: Metadata = { title: 'Audit log' };

export default async function OrgAuditPage({ params, searchParams }: { params: Promise<{ orgSlug: string }>; searchParams: Promise<{ before?: string }> }) {
  const { orgSlug } = await params;
  const { before } = await searchParams;
  const ctx = await requireOrg(orgSlug, 'audit.view');
  const rows = await listOrgAudit(ctx, before);
  const last = rows.at(-1);
  return (
    <>
      <PageHeader title="Audit log" description="ใครเปลี่ยนอะไรในบัญชีนี้ เมื่อไร" />
      <AuditTable rows={rows} nextHref={rows.length === AUDIT_PAGE_SIZE && last ? `?before=${last.id}` : undefined} />
    </>
  );
}
