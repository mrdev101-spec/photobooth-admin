import { ChevronLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireOrg } from '@/server/auth/context';
import { can } from '@/server/auth/rbac';
import { getConfigEditor } from '@/server/services/kiosk-config';
import { hasStorage } from '@/server/services/storage';
import { AppError } from '@/server/lib/errors';
import { Notice, PageHeader } from '@/components/ui';
import { formatDateTime, formatRelative } from '@/lib/format';
import { KioskTabs } from '../kiosk-tabs';
import { ConfigEditor } from './config-editor';
import { editorCatalog } from './editor-catalog';

import { resolvePermissions } from '@/lib/config-permissions';
import { editorSources } from '@/server/services/config-presets';

export const metadata: Metadata = { title: 'การตั้งค่าตู้' };

export default async function KioskConfigPage({ params }: { params: Promise<{ orgSlug: string; id: string }> }) {
  const { orgSlug, id } = await params;
  const ctx = await requireOrg(orgSlug, 'kiosk.view');
  const { kiosk, current, lastAck } = await getConfigEditor(ctx, id).catch((err) => {
    if (err instanceof AppError && err.code === 'not_found') notFound();
    throw err;
  });
  const base = `/o/${ctx.org.slug}/kiosks/${kiosk.id}`;
  if (!current) {
    return (
      <>
        <PageHeader title={kiosk.name} />
        <KioskTabs base={base} active="config" paired={false} />
        <Notice tone="info">ตู้นี้ยังไม่เคยจับคู่ การตั้งค่าจะถูกสร้างเมื่อจับคู่ครั้งแรก</Notice>
      </>
    );
  }
  const canEdit = can(ctx.principal, 'config.edit', { branchId: kiosk.branchId }) && kiosk.status !== 'revoked';
  const { adminPin, ...editable } = current.settings;
  const applied = kiosk.appliedRevision ?? 0;

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
        description={<>การตั้งค่า • revision {current.revision} ({formatDateTime(current.createdAt)})</>}
      />
      <KioskTabs base={base} active="config" paired />

      <div className="mb-6 flex flex-col gap-3">
        {kiosk.configError && kiosk.configError.revision >= applied ? (
          <Notice tone="danger">
            ตู้ไม่รับการตั้งค่า revision {kiosk.configError.revision}: {kiosk.configError.message || 'ไม่ระบุสาเหตุ'} — ตู้ยังใช้ค่าชุดเดิม (revision {applied || '—'})
          </Notice>
        ) : kiosk.status === 'active' && applied < current.revision ? (
          <Notice tone="warn">
            รอตู้ใช้ revision {current.revision} (ตู้ใช้ revision {applied || '—'} อยู่) ตู้จะดึงค่าใหม่ภายใน 1 นาที และใช้เมื่อกลับถึงหน้าแรก
          </Notice>
        ) : kiosk.status === 'active' ? (
          <Notice tone="ok">
            ตู้ใช้การตั้งค่าล่าสุดแล้ว{lastAck?.status === 'applied' ? ` (${formatRelative(lastAck.receivedAt)})` : ''}
          </Notice>
        ) : null}
        {kiosk.emergency ? (
          <Notice tone="warn">
            ตู้เปิดโหมดฉุกเฉิน (ใส่รหัสผู้ดูแลที่ตู้) ตั้งแต่ {formatDateTime(new Date(kiosk.emergency.since))} • ค่าที่ต่างจาก Admin:{' '}
            {kiosk.emergency.changes.length ? kiosk.emergency.changes.map((c) => `${c.key} = ${JSON.stringify(c.value)}`).join(', ') : 'ยังไม่มี'} • การตั้งค่าใหม่จาก Admin จะรอจนกว่าเจ้าหน้าที่กด &quot;กลับไปใช้ค่าจาก Admin&quot; ที่ตู้
          </Notice>
        ) : null}
        {!canEdit ? <Notice tone="info">คุณดูการตั้งค่าได้อย่างเดียว</Notice> : null}
      </div>

      <ConfigEditor
        orgSlug={ctx.org.slug}
        kioskRowId={kiosk.id}
        baseRevision={current.revision}
        initial={editable}
        hasPin={!!adminPin}
        canEdit={canEdit}
        livePaymentsAllowed={ctx.org.livePaymentsAllowed}
        storageConfigured={await hasStorage(ctx.org.id)}
        permissions={resolvePermissions(ctx.org.configPermissions)}
        isPlatform={!!ctx.principal.platformRole}
        catalog={await editorCatalog(ctx.org.id)}
        sources={(await editorSources(ctx)).map((x) => ({ id: x.source.kind === 'event' ? x.source.id : null, label: x.label, settings: x.settings, hasPin: x.hasPin }))}
        initialEventId={kiosk.eventId}
        initialOwn={kiosk.ownSections}
      />
    </>
  );
}
