import { redirect } from 'next/navigation';
import { requirePlatform } from '@/server/auth/context';
import { stockOrg } from '@/server/services/organizations';

/** คลังตู้: the stock account's kiosk page (created on first visit). */
export default async function StockPage() {
  await requirePlatform();
  const stock = await stockOrg();
  redirect(`/platform/organizations/${stock.id}/kiosks`);
}
