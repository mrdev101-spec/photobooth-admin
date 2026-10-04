import type { Metadata } from 'next';
import { requirePlatform } from '@/server/auth/context';
import { AUDIT_PAGE_SIZE, listPlatformAudit } from '@/server/services/audit-log';
import { AuditTable } from '@/components/audit-table';
import { PageHeader } from '@/components/ui';

export const metadata: Metadata = { title: 'Audit log' };

export default async function PlatformAuditPage({ searchParams }: { searchParams: Promise<{ before?: string }> }) {
  await requirePlatform();
  const { before } = await searchParams;
  const rows = await listPlatformAudit({ before });
  const last = rows.at(-1);
  return (
    <>
      <PageHeader title="Audit log" description="การกระทำระดับแพลตฟอร์ม (การกระทำภายในบัญชีลูกค้าดูได้ที่บัญชีนั้น)" />
      <AuditTable rows={rows} nextHref={rows.length === AUDIT_PAGE_SIZE && last ? `?before=${last.id}` : undefined} />
    </>
  );
}
