import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { UPLOADED_TEMPLATE_KINDS, type AiSceneSpec, type FrameSpec, type TemplateFiles, type UploadedTemplateKind } from '@photobooth/contracts';
import { requirePlatform } from '@/server/auth/context';
import { AppError } from '@/server/lib/errors';
import { assetPath, assetStorageMode } from '@/server/services/asset-store';
import { publishIssues, studio } from '@/server/services/template-studio';
import { ActionForm, FormField, SubmitButton } from '@/components/form';
import { Badge, Card, Input, Notice, PageHeader } from '@/components/ui';
import { TEMPLATE_KINDS } from '@/lib/template-visibility';
import { updateInfoAction } from '../../../studio-actions';
import { AiSceneEditor } from './ai-scene-editor';
import { FrameEditor, type EditorFile } from './frame-editor';

export const metadata: Metadata = { title: 'แก้ไข Template' };

// The fonts kiosks ship (TEMPLATE_FONTS), so the canvas preview draws text as the kiosk will
const TEMPLATE_FONTS_CSS =
  'https://fonts.googleapis.com/css2?family=Bangers&family=Caveat:wght@400..700&family=Fredoka:wght@400..700&family=Pacifico&family=Playfair+Display:wght@400..800&family=Sarabun:wght@400;500;600;700;800&family=Space+Grotesk:wght@400..700&display=swap';

const fileOf = (files: TemplateFiles, k: keyof TemplateFiles): EditorFile | null => {
  const f = files[k];
  return f ? { url: assetPath(f.url), width: f.width, height: f.height, bytes: f.bytes } : null;
};

export default async function EditTemplatePage({ params }: { params: Promise<{ kind: string; id: string }> }) {
  await requirePlatform('platform.catalog');
  const { kind, id } = await params;
  if (!UPLOADED_TEMPLATE_KINDS.includes(kind as UploadedTemplateKind)) notFound();
  const k = kind as UploadedTemplateKind;
  const s = await studio(k, id).catch((err) => {
    if (err instanceof AppError && err.code === 'not_found') notFound();
    throw err;
  });
  // Edit the draft, or (no draft yet) start from the published version; saving creates the draft
  const base = s.draft ?? s.published ?? s.versions[0]!;
  const section = TEMPLATE_KINDS.find((x) => x.kind === k)!;
  const storage = assetStorageMode();

  return (
    <>
      <link rel="stylesheet" href={TEMPLATE_FONTS_CSS} precedence="default" />
      <PageHeader
        breadcrumb={
          <Link href={`/platform/templates/${k}/${id}`} className="inline-flex items-center gap-1 hover:text-ink-900">
            <ChevronLeft className="size-4" aria-hidden />
            {s.template.name}
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            แก้ไข Template
            <Badge tone={s.template.status === 'published' ? 'success' : s.template.status === 'draft' ? 'warning' : 'neutral'} dot>
              {s.template.status === 'published' ? `เผยแพร่อยู่ (v${s.template.publishedVersion})` : s.template.status === 'draft' ? 'ร่าง ยังไม่เผยแพร่' : 'เลิกใช้'}
            </Badge>
          </span>
        }
        description={`${section.label} • ${id}`}
      />

      {storage === 'local' ? (
        <Notice tone="info" className="mb-5">
          ไฟล์เก็บในเครื่องนี้ชั่วคราว (ยังไม่ได้ตั้ง bucket ส่วนกลาง PLATFORM_R2_*) เมื่อตั้งแล้วไฟล์ใหม่จะขึ้น R2 ของบริษัท
        </Notice>
      ) : storage === 'none' ? (
        <Notice tone="warn" className="mb-5">
          ยังไม่ได้ตั้ง bucket ส่วนกลาง (PLATFORM_R2_*) จึงอัปโหลดไฟล์ไม่ได้
        </Notice>
      ) : null}

      <Card title="ข้อมูล Template" className="mb-5">
        <ActionForm action={updateInfoAction.bind(null, k, id)} className="grid gap-4 md:grid-cols-[1fr_2fr_1fr_auto] md:items-end">
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

      {k === 'ai-scene' ? (
        <AiSceneEditor
          id={id}
          initialSpec={base.spec as AiSceneSpec}
          files={{ plate: fileOf(base.files, 'plate') ?? undefined, female: fileOf(base.files, 'female') ?? undefined, male: fileOf(base.files, 'male') ?? undefined }}
          draftVersion={s.draft?.version ?? null}
          hasPublished={!!s.published}
          issues={publishIssues(k, base, { uploaded: s.template.source === 'uploaded' })}
          uploaded={s.template.source === 'uploaded'}
        />
      ) : (
        <FrameEditor
          kind={k}
          id={id}
          initialSpec={base.spec as FrameSpec}
          overlay={fileOf(base.files, 'overlay')}
          sample={fileOf(base.files, 'sample')}
          draftVersion={s.draft?.version ?? null}
          hasPublished={!!s.published}
        />
      )}
    </>
  );
}
