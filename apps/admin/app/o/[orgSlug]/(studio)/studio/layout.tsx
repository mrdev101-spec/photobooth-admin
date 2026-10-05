import type { Metadata } from 'next';
import { requireOrg } from '@/server/auth/context';

export const metadata: Metadata = { title: { template: '%s • Event Studio', default: 'Event Studio' } };

/** Event Studio: its own frame and accent (see .studio-theme in globals.css), outside the Admin shell. */
export default async function StudioLayout({ children, params }: { children: React.ReactNode; params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  await requireOrg(orgSlug, 'console.view');
  return <div className="studio-theme min-h-dvh bg-canvas">{children}</div>;
}
