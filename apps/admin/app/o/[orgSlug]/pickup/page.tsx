import type { Metadata } from 'next';
import { requireOrg } from '@/server/auth/context';
import { PageHeader } from '@/components/ui';
import { PickupCounter } from './pickup-counter';

export const metadata: Metadata = { title: 'จุดรับรูป' };

/** Pickup counter: leave this page open at the desk for the whole event (docs §18.3). */
export default async function PickupPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const ctx = await requireOrg(orgSlug, 'pickup.use');
  return (
    <>
      <PageHeader title="จุดรับรูป" description="เปิดหน้านี้ไว้ที่โต๊ะรับรูป ออเดอร์ใหม่จากตู้จะเด้งขึ้นพร้อมเสียง สแกนใบรับรูปเพื่อพิมพ์และส่งมอบ" />
      <PickupCounter orgSlug={ctx.org.slug} orgName={ctx.org.name} />
    </>
  );
}
