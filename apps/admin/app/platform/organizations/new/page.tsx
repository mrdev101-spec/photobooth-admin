import { Building2, ChevronLeft, UserRound } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePlatform } from '@/server/auth/context';
import { ActionForm, FormField, SubmitButton } from '@/components/form';
import { Card, Input, PageHeader } from '@/components/ui';
import { createOrganizationAction } from '../actions';

export const metadata: Metadata = { title: 'เพิ่มลูกค้า' };

export default async function NewOrganizationPage() {
  await requirePlatform('platform.org.manage');
  return (
    <>
      <PageHeader
        breadcrumb={
          <Link href="/platform/organizations" className="inline-flex items-center gap-1 hover:text-ink-900">
            <ChevronLeft className="size-4" aria-hidden />
            บัญชีลูกค้า
          </Link>
        }
        title="เพิ่มลูกค้า"
        description="สร้างบัญชีร้านพร้อมเจ้าของบัญชี ระบบออกรหัสผ่านชั่วคราวให้ส่งต่อ"
      />
      <Card className="max-w-2xl" title="ข้อมูลลูกค้า" icon={<Building2 aria-hidden />}>
        <ActionForm action={createOrganizationAction} className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <FormField label="ชื่อลูกค้า" name="name">
              <Input id="name" name="name" required maxLength={200} />
            </FormField>
          </div>
          <FormField label="Slug (ใช้ใน URL)" name="slug" hint="เว้นว่างเพื่อสร้างจากชื่อ">
            <Input id="slug" name="slug" pattern="[a-z0-9\-]*" maxLength={48} placeholder="party-booth" />
          </FormField>
          <div />
          <FormField label="จำนวนตู้สูงสุด" name="kioskQuota" hint="เว้นว่าง = ไม่จำกัด">
            <Input id="kioskQuota" name="kioskQuota" type="number" min={0} defaultValue={5} placeholder="ไม่จำกัด" />
          </FormField>
          <FormField label="จำนวนผู้ใช้สูงสุด" name="userQuota" hint="รวมเจ้าของ • เว้นว่าง = ไม่จำกัด">
            <Input id="userQuota" name="userQuota" type="number" min={1} defaultValue={3} placeholder="ไม่จำกัด" />
          </FormField>
          <FormField label="ภาพ AI ต่อเดือน" name="aiMonthlyQuota" hint="เว้นว่าง = ไม่จำกัด">
            <Input id="aiMonthlyQuota" name="aiMonthlyQuota" type="number" min={0} defaultValue={300} placeholder="ไม่จำกัด" />
          </FormField>
          <div />

          <p className="flex items-center gap-2 border-t border-ink-100 pt-4 font-semibold text-ink-900 sm:col-span-2">
            <UserRound className="size-5 text-primary-600" aria-hidden />
            เจ้าของบัญชี
          </p>
          <FormField label="อีเมล" name="ownerEmail">
            <Input id="ownerEmail" name="ownerEmail" type="email" required />
          </FormField>
          <FormField label="ชื่อ" name="ownerName">
            <Input id="ownerName" name="ownerName" required maxLength={120} />
          </FormField>
          <div className="sm:col-span-2">
            <SubmitButton>สร้างบัญชีลูกค้า</SubmitButton>
          </div>
        </ActionForm>
      </Card>
    </>
  );
}
