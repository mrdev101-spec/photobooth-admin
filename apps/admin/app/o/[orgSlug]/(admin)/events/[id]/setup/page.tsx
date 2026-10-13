import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { requireOrg } from '@/server/auth/context';
import { can } from '@/server/auth/rbac';
import { editorSources, getEventEditor } from '@/server/services/config-presets';
import { hasStorage } from '@/server/services/storage';
import { AppError } from '@/server/lib/errors';
import { resolvePermissions } from '@/lib/config-permissions';
import { PageHeader } from '@/components/ui';
import { ConfigEditor } from '../../../kiosks/[id]/config/config-editor';
import { editorCatalog } from '../../../kiosks/[id]/config/editor-catalog';
import { saveEventSettingsAction } from '../../actions';

export const metadata: Metadata = { title: 'ตั้งงาน' };

/** A new event, step by step (mode → name and brand → products → frames → printing → review). */
export default async function EventSetupPage({ params }: { params: Promise<{ orgSlug: string; id: string }> }) {
  const { orgSlug, id } = await params;
  const ctx = await requireOrg(orgSlug, 'kiosk.view');
  const canEdit = can(ctx.principal, 'config.edit') && (!!ctx.principal.platformRole || ctx.principal.branches === 'all');
  const back = `/o/${ctx.org.slug}/events/${id}`;
  if (!canEdit) redirect(back);
  const { event } = await getEventEditor(ctx, id).catch((err) => {
    if (err instanceof AppError && err.code === 'not_found') notFound();
    throw err;
  });
  const { adminPin, ...editable } = event.settings;
  // Start from ค่ากลาง or another event
  const copySources = (await editorSources(ctx))
    .filter((x) => !(x.source.kind === 'event' && x.source.id === event.id))
    .map((x) => ({ id: x.source.kind === 'event' ? x.source.id : 'defaults', label: x.label, settings: x.settings }));

  return (
    <>
      <PageHeader
        title={`ตั้งงาน: ${event.name}`}
        breadcrumb={
          <Link href={back} className="inline-flex items-center gap-1 hover:text-ink-900">
            <ChevronLeft className="size-4" aria-hidden />
            {event.name}
          </Link>
        }
        description="ตั้งทีละขั้นตามโหมดที่เลือก • แก้ทุกอย่างได้อีกที่หน้างาน"
      />
      <ConfigEditor
        variant="wizard"
        scope="preset"
        orgSlug={ctx.org.slug}
        kioskRowId=""
        baseRevision={0}
        baseUpdatedAt={event.updatedAt.toISOString()}
        saveAction={saveEventSettingsAction.bind(null, ctx.org.slug, event.id)}
        initial={editable}
        hasPin={!!adminPin}
        canEdit
        livePaymentsAllowed={ctx.org.livePaymentsAllowed}
        storageConfigured={await hasStorage(ctx.org.id)}
        permissions={resolvePermissions(ctx.org.configPermissions)}
        isPlatform={!!ctx.principal.platformRole}
        catalog={await editorCatalog(ctx.org.id)}
        copySources={copySources}
        doneHref={back}
      />
    </>
  );
}
