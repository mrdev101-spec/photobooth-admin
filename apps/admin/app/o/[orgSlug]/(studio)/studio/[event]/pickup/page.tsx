import type { Metadata } from 'next';
import { requireOrg } from '@/server/auth/context';
import { studioEvent } from '@/server/services/event-console';
import { PickupCounter } from '@/app/o/[orgSlug]/(admin)/pickup/pickup-counter';
import { StudioTitle } from '../../_components/studio-shell';

export const metadata: Metadata = { title: 'จุดรับรูป' };

/** The pickup counter, only this event's orders. */
export default async function StudioPickupPage({ params }: { params: Promise<{ orgSlug: string; event: string }> }) {
  const { orgSlug, event } = await params;
  const ctx = await requireOrg(orgSlug, 'pickup.use');
  const ev = await studioEvent(ctx, event);
  return (
    <>
      <StudioTitle title="จุดรับรูป" description="ออเดอร์ใหม่ของงานนี้เด้งขึ้นพร้อมเสียง สแกนใบรับรูปเพื่อพิมพ์และส่งมอบ" />
      <PickupCounter orgSlug={ctx.org.slug} orgName={ctx.org.name} eventId={ev?.id ?? null} />
    </>
  );
}
