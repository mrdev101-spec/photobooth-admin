import { CalendarRange, ChevronLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireOrg } from '@/server/auth/context';
import { can } from '@/server/auth/rbac';
import { getEventEditor } from '@/server/services/config-presets';
import { hasStorage } from '@/server/services/storage';
import { AppError } from '@/server/lib/errors';
import { resolvePermissions } from '@/lib/config-permissions';
import { ActionForm, FormField, SubmitButton } from '@/components/form';
import { Badge, Card, Input, Notice, PageHeader, buttonClass } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import { ConfigEditor } from '../../kiosks/[id]/config/config-editor';
import { editorCatalog } from '../../kiosks/[id]/config/editor-catalog';
import { FollowingKiosks } from '../following-kiosks';
import { followLayerAction, saveEventSettingsAction, setEventActiveAction, updateEventInfoAction } from '../actions';

import { ALWAYS_OWN, normalizeOwnSections } from '@/lib/config-layers';

/** Section id → names of the kiosks (of this layer) that set it themselves. */
function ownersOf(kiosks: { name: string; ownSections: string[] | null }[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const k of kiosks) for (const id of normalizeOwnSections(k.ownSections)) if (!ALWAYS_OWN.includes(id)) (out[id] ??= []).push(k.name);
  return out;
}

export const metadata: Metadata = { title: 'งาน' };

export default async function EventPage({ params }: { params: Promise<{ orgSlug: string; id: string }> }) {
  const { orgSlug, id } = await params;
  const ctx = await requireOrg(orgSlug, 'kiosk.view');
  const { event, following } = await getEventEditor(ctx, id).catch((err) => {
    if (err instanceof AppError && err.code === 'not_found') notFound();
    throw err;
  });
  const canEdit = can(ctx.principal, 'config.edit') && (!!ctx.principal.platformRole || ctx.principal.branches === 'all');
  const { adminPin, ...editable } = event.settings;

  return (
    <>
      <PageHeader
        title={event.name}
        breadcrumb={
          <Link href={`/o/${ctx.org.slug}/events`} className="inline-flex items-center gap-1 hover:text-ink-900">
            <ChevronLeft className="size-4" aria-hidden />
            ค่ากลางและงาน
          </Link>
        }
        description={<>แก้ล่าสุด {formatDateTime(event.updatedAt)}</>}
        actions={
          <span className="flex items-center gap-3">
            {canEdit ? (
              <Link href={`/o/${ctx.org.slug}/events/${event.id}/setup`} className={buttonClass('outline', 'sm')}>
                ตัวช่วยตั้งงานทีละขั้น
              </Link>
            ) : null}
            {event.isActive ? <Badge tone="success" dot>เปิดอยู่</Badge> : <Badge dot>ปิดแล้ว</Badge>}
          </span>
        }
      />

      <div className="mb-6 flex max-w-5xl flex-col gap-3">
        {!event.isActive ? <Notice tone="warn">งานนี้ปิดแล้ว ตู้ที่เคยอยู่ในงานใช้ค่ากลางอยู่ เปิดงานอีกครั้งเพื่อให้กลับมาใช้ค่าของงาน</Notice> : null}
        {!canEdit ? <Notice tone="info">คุณดูได้อย่างเดียว (แก้งานต้องมีสิทธิ์ตั้งค่าตู้ทุกสาขา)</Notice> : null}
      </div>

      {canEdit ? (
        <Card title="ข้อมูลงาน" icon={<CalendarRange aria-hidden />} className="mb-6 max-w-5xl">
          <ActionForm action={updateEventInfoAction.bind(null, ctx.org.slug, event.id)} className="grid gap-4 sm:grid-cols-[1fr_1.5fr_auto] sm:items-end">
            <FormField label="ชื่องาน" name="name">
              <Input name="name" defaultValue={event.name} required maxLength={120} aria-label="ชื่องาน" />
            </FormField>
            <FormField label="รายละเอียด" name="note">
              <Input name="note" defaultValue={event.note} maxLength={500} aria-label="รายละเอียด" />
            </FormField>
            <SubmitButton variant="outline">บันทึก</SubmitButton>
          </ActionForm>
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-ink-100 pt-3">
            <span className="text-sm text-ink-500">{event.isActive ? 'ปิดงานเมื่อจบงาน: ตู้ในงานกลับไปใช้ค่ากลาง' : 'เปิดงาน: ตู้ที่อยู่ในงานกลับมาใช้ค่าของงาน'}</span>
            <ActionForm
              action={setEventActiveAction.bind(null, ctx.org.slug, event.id, !event.isActive)}
              confirm={event.isActive ? `ปิดงาน "${event.name}"? ตู้ ${following.length} ตู้ในงานจะกลับไปใช้ค่ากลาง` : undefined}
            >
              <SubmitButton variant={event.isActive ? 'secondary' : 'primary'} size="sm">
                {event.isActive ? 'ปิดงาน' : 'เปิดงานอีกครั้ง'}
              </SubmitButton>
            </ActionForm>
          </div>
        </Card>
      ) : null}

      <FollowingKiosks orgSlug={ctx.org.slug} kiosks={following} empty='ยังไม่มีตู้ในงานนี้ เลือกงานนี้ได้ที่ "ที่มาของการตั้งค่า" ในหน้าการตั้งค่าของแต่ละตู้' />

      <ConfigEditor
        scope="preset"
        orgSlug={ctx.org.slug}
        kioskRowId=""
        baseRevision={0}
        baseUpdatedAt={event.updatedAt.toISOString()}
        saveAction={saveEventSettingsAction.bind(null, ctx.org.slug, event.id)}
        initial={editable}
        hasPin={!!adminPin}
        canEdit={canEdit}
        livePaymentsAllowed={ctx.org.livePaymentsAllowed}
        storageConfigured={await hasStorage(ctx.org.id)}
        permissions={resolvePermissions(ctx.org.configPermissions)}
        isPlatform={!!ctx.principal.platformRole}
        catalog={await editorCatalog(ctx.org.id)}
        layerOwners={ownersOf(following)}
        followAction={followLayerAction.bind(null, ctx.org.slug, event.id)}
      />
    </>
  );
}
