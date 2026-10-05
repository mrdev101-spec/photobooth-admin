import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import type { FrameSpec, TemplateFiles } from '@photobooth/contracts';
import { requireOrg } from '@/server/auth/context';
import { AppError } from '@/server/lib/errors';
import { assetPath, assetStorageMode } from '@/server/services/asset-store';
import { SHOP_TEMPLATE_KINDS, studio } from '@/server/services/template-studio';
import { ActionForm, FormField, SubmitButton } from '@/components/form';
import { Badge, Card, Input, Notice, PageHeader } from '@/components/ui';
import { FrameEditor, type EditorFile } from '@/app/platform/templates/[kind]/[id]/edit/frame-editor';
import { discardShopDraftAction, publishShopDraftAction, removeShopFileAction, saveShopDraftAction, updateShopInfoAction, uploadShopFileAction } from '../../../studio-actions';

export const metadata: Metadata = { title: 'แก้ไข Template ของร้าน' };

// The fonts kiosks ship (TEMPLATE_FONTS), so the canvas preview draws text as the kiosk will
const TEMPLATE_FONTS_CSS =
  'https://fonts.googleapis.com/css2?family=Bangers&family=Caveat:wght@400..700&family=Fredoka:wght@400..700&family=Pacifico&family=Playfair+Display:wght@400..800&family=Sarabun:wght@400;500;600;700;800&family=Space+Grotesk:wght@400..700&display=swap';

const LABEL: Record<string, string> = { 'photo-4x6': 'กรอบภาพ 4x6', badge: 'กรอบเข็มกลัด' };

const fileOf = (files: TemplateFiles, k: keyof TemplateFiles): EditorFile | null => {
  const f = files[k];
  return f ? { url: assetPath(f.url), width: f.width, height: f.height, bytes: f.bytes } : null;
};

/** A customer edits one of its own templates (the platform's editor, with the shop's actions). */
export default async function ShopTemplateEditPage({ params }: { params: Promise<{ orgSlug: string; kind: string; id: string }> }) {
  const { orgSlug, kind, id } = await params;
  const ctx = await requireOrg(orgSlug, 'template.manage');
  if (!(SHOP_TEMPLATE_KINDS as readonly string[]).includes(kind)) notFound();
  const k = kind as (typeof SHOP_TEMPLATE_KINDS)[number];
  const s = await studio(k, id).catch((err) => {
    if (err instanceof AppError && err.code === 'not_found') notFound();
    throw err;
  });
  if (s.template.orgId !== ctx.org.id) notFound();
  const base = s.draft ?? s.published ?? s.versions[0]!;
  const slug = ctx.org.slug;

  return (
    <>
      <link rel="stylesheet" href={TEMPLATE_FONTS_CSS} precedence="default" />
      <PageHeader
        breadcrumb={
          <Link href={`/o/${slug}/templates`} className="inline-flex items-center gap-1 hover:text-ink-900">
            <ChevronLeft className="size-4" aria-hidden />
            Template
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            {s.template.name ?? 'Template ของร้าน'}
            <Badge tone={s.template.status === 'published' ? 'success' : s.template.status === 'draft' ? 'warning' : 'neutral'} dot>
              {s.template.status === 'published' ? `เผยแพร่อยู่ (v${s.template.publishedVersion})` : s.template.status === 'draft' ? 'ร่าง ยังไม่เผยแพร่' : 'เลิกใช้'}
            </Badge>
          </span>
        }
        description={`${LABEL[k]} ของร้าน • ใช้ได้เฉพาะตู้ของร้านนี้ • เผยแพร่แล้วตู้ที่ออนไลน์ได้รับภายในไม่กี่วินาที`}
      />

      {assetStorageMode() === 'none' ? (
        <Notice tone="warn" className="mb-5">
          ระบบยังอัปโหลดไฟล์ไม่ได้ ติดต่อผู้ให้บริการ
        </Notice>
      ) : null}

      <Card title="ข้อมูล Template" className="mb-5">
        <ActionForm action={updateShopInfoAction.bind(null, slug, k, id)} className="grid gap-4 md:grid-cols-[1fr_2fr_1fr_auto] md:items-end">
          <FormField label="ชื่อ" name="name" required>
            <Input name="name" defaultValue={s.template.name ?? ''} maxLength={80} required />
          </FormField>
          <FormField label="คำอธิบาย" name="description">
            <Input name="description" defaultValue={s.template.description ?? ''} maxLength={300} />
          </FormField>
          <FormField label="แท็ก (คั่นด้วย ,)" name="tags">
            <Input name="tags" defaultValue={(s.template.tags ?? []).join(', ')} />
          </FormField>
          <SubmitButton variant="outline">บันทึกข้อมูล</SubmitButton>
        </ActionForm>
      </Card>

      <FrameEditor
        kind={k}
        id={id}
        initialSpec={base.spec as FrameSpec}
        overlay={fileOf(base.files, 'overlay')}
        sample={fileOf(base.files, 'sample')}
        draftVersion={s.draft?.version ?? null}
        hasPublished={!!s.published}
        actions={{
          uploadFile: uploadShopFileAction.bind(null, slug),
          saveDraft: saveShopDraftAction.bind(null, slug),
          publishDraft: publishShopDraftAction.bind(null, slug),
          discardDraft: discardShopDraftAction.bind(null, slug),
          removeFile: removeShopFileAction.bind(null, slug)
        }}
      />
    </>
  );
}
