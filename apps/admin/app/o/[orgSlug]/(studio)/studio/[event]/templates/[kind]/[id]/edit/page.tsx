import type { Metadata } from 'next';
import { ShopTemplateEditor } from '@/app/o/[orgSlug]/(admin)/templates/shop-template-editor';

export const metadata: Metadata = { title: 'แก้ไข Template ของร้าน' };

/** The shop's template editor without leaving Event Studio. */
export default async function StudioTemplateEditPage({ params }: { params: Promise<{ orgSlug: string; event: string; kind: string; id: string }> }) {
  const { orgSlug, event, kind, id } = await params;
  return <ShopTemplateEditor orgSlug={orgSlug} kind={kind} id={id} back={{ href: `/o/${orgSlug}/studio/${event}/templates`, label: 'Template ของงาน' }} />;
}
