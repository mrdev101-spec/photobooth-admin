import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireOrg } from '@/server/auth/context';
import { studioEvent } from '@/server/services/event-console';
import { sourceQuickView } from '@/server/services/quick-settings';
import { editorCatalog } from '@/app/o/[orgSlug]/(admin)/kiosks/[id]/config/editor-catalog';
import { EventSettingsForm } from '../../_components/event-settings';
import { StudioTitle } from '../../_components/studio-shell';

export const metadata: Metadata = { title: 'ตั้งค่างาน' };

/** The event's settings in one place (every kiosk of the event follows them). */
export default async function StudioSettingsPage({ params }: { params: Promise<{ orgSlug: string; event: string }> }) {
  const { orgSlug, event } = await params;
  const ctx = await requireOrg(orgSlug, 'config.edit');
  const ev = await studioEvent(ctx, event);
  if (!ev) redirect(`/o/${ctx.org.slug}/studio?pick=1`);
  const [view, catalog] = await Promise.all([sourceQuickView(ctx, ev.id), editorCatalog(ctx.org.id)]);
  return (
    <>
      <StudioTitle
        title="ตั้งค่างาน"
        description={`ใช้กับทุกตู้ที่ใช้${view.source.label} (${view.source.kiosks} ตู้) • ตั้งเฉพาะตู้ได้จากหน้า "ตู้" • ค่าอื่นทั้งหมดอยู่ที่ Admin › ค่ากลางและงาน`}
      />
      <EventSettingsForm
        orgSlug={ctx.org.slug}
        eventKey={ev.key}
        values={view.values}
        locked={view.locked}
        ownCount={view.ownCount}
        source={view.source}
        catalog={{ photo: catalog.photo, badge: catalog.badge }}
        canSource={view.canSource}
        owners={view.owners}
        parts={['mode', 'event', 'payment', 'products', 'print']}
      />
    </>
  );
}
