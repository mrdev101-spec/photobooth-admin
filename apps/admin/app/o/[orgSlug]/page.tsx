import { redirect } from 'next/navigation';
import { getOrgContext } from '@/server/auth/context';
import { can } from '@/server/auth/rbac';

export default async function OrgHome({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const ctx = await getOrgContext(orgSlug);
  // On-site staff work in the Event Console only
  if (can(ctx.principal, 'console.view') && !can(ctx.principal, 'kiosk.view')) redirect(`/o/${orgSlug}/console`);
  redirect(`/o/${orgSlug}/dashboard`);
}
