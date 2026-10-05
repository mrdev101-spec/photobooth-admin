import type { Metadata } from 'next';
import { ShopTemplateEditor } from '../../../shop-template-editor';

export const metadata: Metadata = { title: 'แก้ไข Template ของร้าน' };

export default async function ShopTemplateEditPage({ params }: { params: Promise<{ orgSlug: string; kind: string; id: string }> }) {
  const { orgSlug, kind, id } = await params;
  return <ShopTemplateEditor orgSlug={orgSlug} kind={kind} id={id} back={{ href: `/o/${orgSlug}/templates`, label: 'Template' }} />;
}
