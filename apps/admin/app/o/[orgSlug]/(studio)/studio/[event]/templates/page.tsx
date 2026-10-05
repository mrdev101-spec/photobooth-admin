import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireOrg } from '@/server/auth/context';
import { can } from '@/server/auth/rbac';
import { studioEvent } from '@/server/services/event-console';
import { sourceQuickView } from '@/server/services/quick-settings';
import { editorCatalog } from '@/app/o/[orgSlug]/(admin)/kiosks/[id]/config/editor-catalog';
import { ShopTemplates } from '@/app/o/[orgSlug]/(admin)/templates/shop-templates';
import { EventSettingsForm } from '../../_components/event-settings';
import { StudioTitle } from '../../_components/studio-shell';

export const metadata: Metadata = { title: 'Template ของงาน' };

/** Frames this event offers, and the shop's own templates (made and published from here). */
export default async function StudioTemplatesPage({ params }: { params: Promise<{ orgSlug: string; event: string }> }) {
  const { orgSlug, event } = await params;
  const ctx = await requireOrg(orgSlug, 'console.view');
  const ev = await studioEvent(ctx, event);
  if (!ev) redirect(`/o/${ctx.org.slug}/studio?pick=1`);
  const canConfig = can(ctx.principal, 'config.edit');
  const [view, catalog] = await Promise.all([canConfig ? sourceQuickView(ctx, ev.id) : null, editorCatalog(ctx.org.id)]);
  return (
    <>
      <StudioTitle title="Template ของงาน" description="เลือกกรอบที่ลูกค้าเห็นในงานนี้ • template ของร้านที่เผยแพร่แล้วขึ้นตู้ทันที" />
      <ShopTemplates orgSlug={ctx.org.slug} orgId={ctx.org.id} canManage={can(ctx.principal, 'template.manage')} editBase={`/o/${ctx.org.slug}/studio/${ev.key}/templates`} />
      {view ? (
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
          parts={['templates']}
        />
      ) : null}
    </>
  );
}
