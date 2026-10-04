import type { Metadata } from 'next';
import { requirePlatform } from '@/server/auth/context';
import { canPlatform } from '@/server/auth/rbac';
import { storageSummary } from '@/server/services/storage';
import { StorageCard } from '../storage-card';

export const metadata: Metadata = { title: 'พื้นที่เก็บภาพ' };

export default async function OrganizationStoragePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await requirePlatform();
  const storage = await storageSummary(id);
  return <StorageCard orgId={id} s={storage} canManage={canPlatform(user.platformRole, 'platform.org.manage')} />;
}
