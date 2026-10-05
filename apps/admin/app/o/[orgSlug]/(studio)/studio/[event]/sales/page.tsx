import type { Metadata } from 'next';
import { requireOrg } from '@/server/auth/context';
import { OrdersToday, SalesBreakdown, SalesStats } from '../../_components/live';
import { StudioTitle } from '../../_components/studio-shell';

export const metadata: Metadata = { title: 'ยอดขายและออเดอร์' };

export default async function StudioSalesPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  await requireOrg(orgSlug, 'report.view');
  return (
    <div className="flex flex-col gap-5">
      <StudioTitle title="ยอดขายและออเดอร์" description="เฉพาะตู้ของงานนี้ วันนี้" />
      <SalesStats />
      <SalesBreakdown />
      <OrdersToday />
    </div>
  );
}
