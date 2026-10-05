import { ChevronLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireOrg } from '@/server/auth/context';
import { can } from '@/server/auth/rbac';
import { listRevisions } from '@/server/services/kiosk-config';
import { AppError } from '@/server/lib/errors';
import { ActionForm, SubmitButton } from '@/components/form';
import { Badge, EmptyState, PageHeader } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import { KioskTabs } from '../../kiosk-tabs';
import { rollbackAction } from '../actions';

export const metadata: Metadata = { title: 'ประวัติการตั้งค่า' };

export default async function ConfigHistoryPage({ params }: { params: Promise<{ orgSlug: string; id: string }> }) {
  const { orgSlug, id } = await params;
  const ctx = await requireOrg(orgSlug, 'kiosk.view');
  const { kiosk, revisions } = await listRevisions(ctx, id).catch((err) => {
    if (err instanceof AppError && err.code === 'not_found') notFound();
    throw err;
  });
  const canEdit = can(ctx.principal, 'config.edit', { branchId: kiosk.branchId }) && kiosk.status !== 'revoked';
  const base = `/o/${ctx.org.slug}/kiosks/${kiosk.id}`;

  return (
    <>
      <PageHeader
        title={kiosk.name}
        breadcrumb={
          <Link href={`/o/${ctx.org.slug}/kiosks`} className="inline-flex items-center gap-1 hover:text-ink-900">
            <ChevronLeft className="size-4" aria-hidden />
            ตู้ทั้งหมด
          </Link>
        }
        description={<>ประวัติการตั้งค่า</>}
      />
      <KioskTabs base={base} active="history" paired />

      {revisions.length ? (
        <ol className="flex max-w-4xl flex-col gap-3">
          {revisions.map((r) => {
            const isCurrent = r.revision === kiosk.currentRevision;
            return (
              <li key={r.revision} className="rounded-card border border-ink-200 bg-surface p-4 shadow-card">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">Revision {r.revision}</span>
                  {isCurrent ? <Badge tone="info" dot>ล่าสุด</Badge> : null}
                  {r.ack?.status === 'applied' || (kiosk.appliedRevision ?? 0) === r.revision ? <Badge tone="success" dot>ตู้ใช้แล้ว</Badge> : null}
                  {r.ack?.status === 'rejected' ? <Badge tone="danger" dot>ตู้ไม่รับ: {r.ack.error?.message ?? ''}</Badge> : null}
                  <span className="ml-auto text-sm text-ink-500">
                    {formatDateTime(r.createdAt)} • {r.userName ?? 'ระบบ'}
                  </span>
                </div>
                {r.note ? <p className="mt-1 text-sm text-ink-600">{r.note}</p> : null}
                {r.changes.length && r.revision > 1 ? (
                  <table className="mt-3 w-full text-sm">
                    <tbody>
                      {r.changes.map((c) => (
                        <tr key={c.path} className="border-t border-ink-200">
                          <td className="py-1.5 pr-3 text-ink-600">{c.label}</td>
                          <td className="py-1.5 pr-3 text-ink-500 line-through">{c.before}</td>
                          <td className="py-1.5 font-medium">{c.after}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : r.revision === 1 ? null : (
                  <p className="mt-1 text-sm text-ink-500">ค่าเหมือนเดิม (ส่งใหม่เพื่ออัปเดตข้อมูลการเชื่อมต่อ)</p>
                )}
                {canEdit && !isCurrent ? (
                  <ActionForm
                    action={rollbackAction.bind(null, orgSlug, kiosk.id, r.revision, kiosk.currentRevision)}
                    confirm={`ใช้การตั้งค่าของ revision ${r.revision} อีกครั้ง? ระบบจะสร้าง revision ใหม่และส่งไปตู้`}
                    className="mt-3"
                  >
                    <SubmitButton variant="outline" size="sm">
                      ย้อนกลับไปใช้ค่านี้
                    </SubmitButton>
                  </ActionForm>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : (
        <EmptyState title="ยังไม่มีประวัติ" />
      )}
    </>
  );
}
