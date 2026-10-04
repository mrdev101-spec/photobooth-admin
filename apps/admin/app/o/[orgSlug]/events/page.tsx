import { CalendarRange, Layers, Plus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { requireOrg } from '@/server/auth/context';
import { can } from '@/server/auth/rbac';
import { getDefaultsEditor, listEvents } from '@/server/services/config-presets';
import { ActionForm, FormField, SubmitButton } from '@/components/form';
import { Badge, Card, EmptyState, Input, PageHeader } from '@/components/ui';
import { formatRelative } from '@/lib/format';
import { createEventAction } from './actions';

export const metadata: Metadata = { title: 'ค่ากลางและงาน' };

export default async function EventsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const ctx = await requireOrg(orgSlug, 'kiosk.view');
  const base = `/o/${ctx.org.slug}/events`;
  const canEdit = can(ctx.principal, 'config.edit') && (!!ctx.principal.platformRole || ctx.principal.branches === 'all');
  const [defaults, events] = await Promise.all([getDefaultsEditor(ctx), listEvents(ctx)]);
  const followDefaults = defaults.following.filter((k) => k.ownSections != null).length;

  return (
    <>
      <PageHeader
        title="ค่ากลางและงาน"
        description="ตั้งค่าครั้งเดียวใช้กับหลายตู้: ตู้ที่ไม่ได้อยู่ในงานใช้ค่ากลาง ตู้ในงานใช้ค่าของงาน และแต่ละตู้เลือกตั้งบางหมวดเองได้"
      />

      <div className="flex max-w-4xl flex-col gap-6">
        <Card
          title="ค่ากลาง"
          icon={<Layers aria-hidden />}
          actions={
            <Link href={`${base}/defaults`} className="text-sm font-medium text-primary-700 hover:underline">
              {canEdit ? 'แก้ไขค่ากลาง' : 'ดูค่ากลาง'}
            </Link>
          }
        >
          <p className="text-ink-600">
            ใช้กับตู้ที่ไม่ได้อยู่ในงาน ({followDefaults} ตู้) • งานใหม่และตู้ที่จับคู่ใหม่เริ่มจากค่านี้
            {defaults.updatedAt ? ` • แก้ล่าสุด ${formatRelative(defaults.updatedAt)}` : ' • ยังไม่เคยบันทึก (ใช้ค่าเริ่มต้นของโปรแกรมตู้)'}
          </p>
        </Card>

        {canEdit ? (
          <Card title="สร้างงาน" icon={<Plus aria-hidden />}>
            <ActionForm action={createEventAction.bind(null, orgSlug)} resetOnSuccess className="grid gap-4 sm:grid-cols-[1fr_1.5fr_auto] sm:items-end">
              <FormField label="ชื่องาน" name="name">
                <Input id="name" name="name" required maxLength={120} placeholder="งานแต่งคุณเอ & คุณบี" />
              </FormField>
              <FormField label="รายละเอียด" name="note">
                <Input id="note" name="note" maxLength={500} placeholder="วันที่ สถานที่" />
              </FormField>
              <SubmitButton>สร้างงาน</SubmitButton>
            </ActionForm>
            <p className="mt-3 text-sm text-ink-500">งานใหม่เริ่มจากค่ากลาง แล้วแก้เฉพาะที่ต่าง เช่น ราคา ชื่องาน กรอบภาพ จากนั้นเลือกงานนี้ในหน้าการตั้งค่าของแต่ละตู้</p>
          </Card>
        ) : null}

        {events.length ? (
          <div className="flex flex-col gap-3">
            {events.map((e) => (
              <Link key={e.id} href={`${base}/${e.id}`} className="block rounded-card border border-ink-200 bg-surface px-5 py-4 shadow-card transition-colors hover:border-primary-300">
                <div className="flex flex-wrap items-center gap-3">
                  <CalendarRange className="size-5 text-primary-600" aria-hidden />
                  <span className="text-lg font-semibold text-ink-900">{e.name}</span>
                  {e.isActive ? <Badge tone="success" dot>เปิดอยู่</Badge> : <Badge dot>ปิดแล้ว</Badge>}
                  <span className="ml-auto text-sm text-ink-500">{e.kiosks} ตู้{!e.isActive && e.kiosks ? ' (ใช้ค่ากลางอยู่)' : ''} • แก้ล่าสุด {formatRelative(e.updatedAt)}</span>
                </div>
                {e.note ? <p className="mt-1 text-sm text-ink-600">{e.note}</p> : null}
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState title="ยังไม่มีงาน" icon={<CalendarRange aria-hidden />} />
        )}
      </div>
    </>
  );
}
