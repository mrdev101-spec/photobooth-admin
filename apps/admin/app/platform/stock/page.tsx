import { redirect } from 'next/navigation';
import { requirePlatform } from '@/server/auth/context';
import { stockOrg } from '@/server/services/organizations';

/** คลังตู้ (old link): the kiosks page, stock tab. */
export default async function StockPage() {
  await requirePlatform();
  await stockOrg(); // created on first use
  redirect('/platform/kiosks?tab=stock');
}
