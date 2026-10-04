import { redirect } from 'next/navigation';
import { requireUser } from '@/server/auth/context';
import { organizationsForUser } from '@/server/services/organizations';

/** Entry after sign-in: one customer → its dashboard; several → picker; platform team → console. */
export default async function Home() {
  const user = await requireUser();
  const orgs = await organizationsForUser(user.id);
  if (orgs.length === 1 && !user.platformRole) redirect(`/o/${orgs[0]!.slug}/dashboard`);
  if (orgs.length === 0 && user.platformRole) redirect('/platform/overview');
  redirect('/select-org');
}
