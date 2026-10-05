import { redirect } from 'next/navigation';

/** The console moved into Event Studio (/studio); old links and bookmarks still work. */
export default async function ConsoleRedirect({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  redirect(`/o/${orgSlug}/studio`);
}
