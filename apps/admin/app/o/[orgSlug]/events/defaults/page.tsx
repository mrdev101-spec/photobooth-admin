import { ChevronLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { requireOrg } from '@/server/auth/context';
import { can } from '@/server/auth/rbac';
import { getDefaultsEditor } from '@/server/services/config-presets';
import { hasStorage } from '@/server/services/storage';
import { resolvePermissions } from '@/lib/config-permissions';
import { Notice, PageHeader } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import { ConfigEditor } from '../../kiosks/[id]/config/config-editor';
import { editorCatalog } from '../../kiosks/[id]/config/editor-catalog';
import { FollowingKiosks } from '../following-kiosks';
import { saveDefaultsAction } from '../actions';

export const metadata: Metadata = { title: 'ค่ากลาง' };

export default async function DefaultsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const ctx = await requireOrg(orgSlug, 'kiosk.view');
  const d = await getDefaultsEditor(ctx);
  const canEdit = can(ctx.principal, 'config.edit') && (!!ctx.principal.platformRole || ctx.principal.branches === 'all');
  const { adminPin, ...editable } = d.settings;

  return (
    <>
      <PageHeader
        title="ค่ากลาง"
        breadcrumb={
          <Link href={`/o/${ctx.org.slug}/events`} className="inline-flex items-center gap-1 hover:text-ink-900">
            <ChevronLeft className="size-4" aria-hidden />
            ค่ากลางและงาน
          </Link>
        }
        description={d.updatedAt ? `แก้ล่าสุด ${formatDateTime(d.updatedAt)}` : 'ยังไม่เคยบันทึก: แสดงค่าเริ่มต้นของโปรแกรมตู้'}
      />
      <div className="mb-6 flex max-w-5xl flex-col gap-3">
        <Notice tone="info">ใช้กับตู้ที่ไม่ได้อยู่ในงาน เฉพาะหมวดที่ตู้ไม่ได้ตั้งเอง • เมื่อบันทึก ตู้เหล่านั้นจะได้ค่าใหม่และใช้เมื่อกลับหน้าแรก • งานใหม่และตู้ที่จับคู่ใหม่เริ่มจากค่านี้</Notice>
        {!canEdit ? <Notice tone="info">คุณดูได้อย่างเดียว (แก้ค่ากลางต้องมีสิทธิ์ตั้งค่าตู้ทุกสาขา)</Notice> : null}
      </div>
      <FollowingKiosks orgSlug={ctx.org.slug} kiosks={d.following} empty="ทุกตู้อยู่ในงาน" />
      <ConfigEditor
        scope="preset"
        orgSlug={ctx.org.slug}
        kioskRowId=""
        baseRevision={0}
        baseUpdatedAt={d.updatedAt ? d.updatedAt.toISOString() : null}
        saveAction={saveDefaultsAction.bind(null, ctx.org.slug)}
        initial={editable}
        hasPin={!!adminPin}
        canEdit={canEdit}
        livePaymentsAllowed={ctx.org.livePaymentsAllowed}
        storageConfigured={await hasStorage(ctx.org.id)}
        permissions={resolvePermissions(ctx.org.configPermissions)}
        isPlatform={!!ctx.principal.platformRole}
        catalog={await editorCatalog(ctx.org.id)}
      />
    </>
  );
}
