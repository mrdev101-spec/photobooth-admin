import type { Metadata } from 'next';
import { requireOrg } from '@/server/auth/context';
import { can } from '@/server/auth/rbac';
import { consoleEvents, consoleFeed } from '@/server/services/event-console';
import { ConsoleView } from './console-view';

export const metadata: Metadata = { title: 'Event Console' };

/** The shop's live page at a booth event: kiosks, print queue, photos and the day's sales. */
export default async function ConsolePage({ params, searchParams }: { params: Promise<{ orgSlug: string }>; searchParams: Promise<{ event?: string; kiosk?: string }> }) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const ctx = await requireOrg(orgSlug, 'console.view');
  const filter = { eventId: sp.event || null, kioskId: sp.kiosk || null };
  const [feed, events] = await Promise.all([consoleFeed(ctx, filter), consoleEvents(ctx)]);
  return (
    <ConsoleView
      orgSlug={ctx.org.slug}
      initial={feed}
      events={events}
      initialFilter={filter}
      canAct={can(ctx.principal, 'console.act')}
      canOrders={can(ctx.principal, 'order.view')}
      canQuick={can(ctx.principal, 'config.edit')}
    />
  );
}
