import { redirect } from 'next/navigation';
import { requireOrg } from '@/server/auth/context';
import { can } from '@/server/auth/rbac';
import { consoleFeed, studioEvent } from '@/server/services/event-console';
import { StudioShell } from '../_components/studio-shell';

/** One event in Event Studio: its sidebar, live feed and pages. */
export default async function StudioEventLayout({ children, params }: { children: React.ReactNode; params: Promise<{ orgSlug: string; event: string }> }) {
  const { orgSlug, event } = await params;
  const ctx = await requireOrg(orgSlug, 'console.view');
  const ev = await studioEvent(ctx, event);
  if (!ev) redirect(`/o/${ctx.org.slug}/studio?pick=1`); // closed or unknown event
  const feed = await consoleFeed(ctx, { eventId: ev.id });
  const p = ctx.principal;
  return (
    <StudioShell
      orgSlug={ctx.org.slug}
      orgName={ctx.org.name}
      eventKey={ev.key}
      eventId={ev.id}
      eventName={ev.name}
      userName={ctx.user.name}
      exitHref={can(p, 'kiosk.view') ? `/o/${ctx.org.slug}/dashboard` : `/o/${ctx.org.slug}`}
      initial={feed}
      perms={{
        canAct: can(p, 'console.act'),
        canOrders: can(p, 'order.view'),
        canQuick: can(p, 'config.edit'),
        canSales: can(p, 'report.view'),
        canPickup: can(p, 'pickup.use'),
        canTemplates: can(p, 'config.edit') || can(p, 'template.manage')
      }}
    >
      {children}
    </StudioShell>
  );
}
