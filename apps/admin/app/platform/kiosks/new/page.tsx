import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { requirePlatform } from '@/server/auth/context';
import { shopBranchOptions } from '@/server/services/kiosk-stock';
import { ActionForm, FormField, SubmitButton } from '@/components/form';
import { Card, Input, Notice, PageHeader, Select } from '@/components/ui';
import { createPlatformKioskAction } from '../actions';

export const metadata: Metadata = { title: 'เพิ่มตู้' };

/** + เพิ่มตู้: one question — into stock to test first, or straight to a shop. */
export default async function NewPlatformKioskPage({ searchParams }: { searchParams: Promise<{ org?: string }> }) {
  await requirePlatform('platform.org.manage');
  const sp = await searchParams;
  const shops = await shopBranchOptions();
  const preset = sp.org ? shops.find((s) => s.orgId === sp.org) : undefined;

  return (
    <>
      <PageHeader
        breadcrumb={
          <Link href="/platform/kiosks" className="inline-flex items-center gap-1 hover:text-ink-900">
            <ChevronLeft className="size-4" aria-hidden />
            ตู้
          </Link>
        }
        title="เพิ่มตู้"
        description="เพิ่มแล้วจะได้ Key สำหรับลงทะเบียนที่ตู้ทันที"
      />
      <Card>
        <ActionForm action={createPlatformKioskAction} className="flex max-w-2xl flex-col gap-6">
          <FormField label="ชื่อตู้" name="name" required hint="ชื่อที่ทีมและร้านใช้เรียก เช่น Booth A หน้าลานกิจกรรม">
            <Input id="name" name="name" required maxLength={100} autoFocus />
          </FormField>

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 text-sm font-semibold text-ink-900">ตู้นี้จะไปอยู่ที่ไหน</legend>
            <label className="flex cursor-pointer gap-3 rounded-card border border-ink-200 p-4 has-[:checked]:border-primary-600 has-[:checked]:bg-primary-50">
              <input type="radio" name="dest" value="stock" defaultChecked={!preset} className="mt-1 size-4" />
              <span>
                <span className="block font-semibold text-ink-900">เข้าคลังก่อน (แนะนำ)</span>
                <span className="block text-sm text-ink-500">ได้ Key ให้ช่างลงทะเบียนและทดสอบตู้ → รีเซ็ตและล็อก → มอบให้ร้านภายหลังจากหน้าของตู้</span>
              </span>
            </label>
            <label className="flex cursor-pointer gap-3 rounded-card border border-ink-200 p-4 has-[:checked]:border-primary-600 has-[:checked]:bg-primary-50">
              <input type="radio" name="dest" value="shop" defaultChecked={!!preset} className="mt-1 size-4" disabled={!shops.length} />
              <span className="flex-1">
                <span className="block font-semibold text-ink-900">ให้ร้านเลย</span>
                <span className="block text-sm text-ink-500">ได้ Key ให้ร้านลงทะเบียนที่ตู้ (นับในโควตาตู้ของร้าน)</span>
                {shops.length ? (
                  <Select name="target" defaultValue={preset?.value ?? shops[0]!.value} wrapperClassName="mt-3 max-w-md" aria-label="ร้านและสาขา">
                    {shops.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Notice tone="info" className="mt-3">ยังไม่มีร้านที่มีสาขาใช้งาน</Notice>
                )}
              </span>
            </label>
          </fieldset>

          <div>
            <SubmitButton>เพิ่มตู้และออก Key</SubmitButton>
          </div>
        </ActionForm>
      </Card>
    </>
  );
}
