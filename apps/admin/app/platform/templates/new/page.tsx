import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { requirePlatform } from '@/server/auth/context';
import { ActionForm, FormField, SubmitButton } from '@/components/form';
import { Card, Input, Notice, PageHeader, Select } from '@/components/ui';
import { TEMPLATE_KINDS } from '@/lib/template-visibility';
import { createTemplateAction } from '../studio-actions';

export const metadata: Metadata = { title: 'เพิ่ม Template' };

export default async function NewTemplatePage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  await requirePlatform('platform.catalog');
  const { kind } = await searchParams;
  return (
    <>
      <PageHeader
        breadcrumb={
          <Link href="/platform/templates" className="inline-flex items-center gap-1 hover:text-ink-900">
            <ChevronLeft className="size-4" aria-hidden />
            คลัง Template
          </Link>
        }
        title="เพิ่ม Template"
        description="สร้างเป็นร่างก่อน แล้วอัปโหลดไฟล์และวางช่องในหน้าถัดไป ลูกค้ายังไม่เห็นจนกว่าจะกดเผยแพร่"
      />
      <Card className="max-w-2xl">
        <ActionForm action={createTemplateAction} className="flex flex-col gap-4">
          <FormField label="หมวด" name="kind" required>
            <Select name="kind" defaultValue={TEMPLATE_KINDS.some((k) => k.kind === kind) ? kind : 'photo-4x6'}>
              {TEMPLATE_KINDS.map((k) => (
                <option key={k.kind} value={k.kind}>
                  {k.label} ({k.desc})
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="ชื่อที่ลูกค้าเห็น" name="name" required>
            <Input name="name" maxLength={80} required placeholder="เช่น Summer Fest 2026" />
          </FormField>
          <FormField label="รหัส" name="slug" required hint="ภาษาอังกฤษตัวเล็ก ตัวเลข _ - เปลี่ยนภายหลังไม่ได้ ระบบเติม tpl_ ข้างหน้าให้">
            <Input name="slug" maxLength={41} required pattern="[a-z0-9][a-z0-9_\-]{1,40}" placeholder="summerfest" />
          </FormField>
          <FormField label="คำอธิบาย" name="description">
            <Input name="description" maxLength={300} placeholder="สั้นๆ ให้ลูกค้าเข้าใจว่าแบบนี้เป็นอย่างไร" />
          </FormField>
          <FormField label="แท็ก (คั่นด้วย ,)" name="tags">
            <Input name="tags" placeholder="festival, colorful" />
          </FormField>
          <Notice tone="info">ไฟล์ที่ต้องเตรียม: กรอบ 4x6 = PNG 1200x1800 • เข็มกลัด = PNG 1000x1000 • Classic = PNG กว้าง 576 หรือ 384 • ฉาก AI = ภาพฉากต้นแบบ + ตัวอย่างหญิง/ชาย</Notice>
          <div>
            <SubmitButton pendingLabel="กำลังสร้าง…">สร้างและไปหน้าแก้ไข</SubmitButton>
          </div>
        </ActionForm>
      </Card>
    </>
  );
}
