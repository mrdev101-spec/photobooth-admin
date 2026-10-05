import Link from 'next/link';
import { Upload } from 'lucide-react';
import { shopTemplates } from '@/server/services/template-studio';
import { ActionForm, FormField, SubmitButton } from '@/components/form';
import { Badge, Card, Input, Select, buttonClass } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import { createShopTemplateAction } from './studio-actions';
import { ShopStatusButton } from './shop-status-button';

const KIND_LABEL: Record<string, string> = { 'photo-4x6': 'กรอบภาพ 4x6', badge: 'กรอบเข็มกลัด' };

/** The customer's own templates: create, edit, stop offering (within the platform's quota). */
export async function ShopTemplates({ orgSlug, orgId, canManage, editBase }: { orgSlug: string; orgId: string; canManage: boolean; /** Where the editor opens (default: the Admin's Template page). */ editBase?: string }) {
  const { rows, used, quota } = await shopTemplates(orgId);
  if (quota === 0 && !rows.length) return null; // the platform has not enabled uploads
  const full = quota !== null && used >= quota;
  return (
    <Card
      className="mb-5"
      title="Template ของร้าน"
      subtitle={`ออกแบบกรอบเอง ใช้ได้เฉพาะตู้ของร้านนี้ เผยแพร่แล้วตู้ได้รับทันที${quota === 0 ? '' : ` • ใช้ไป ${used}${quota === null ? '' : ` / ${quota}`} แบบ`}`}
      icon={<Upload aria-hidden />}
    >
      {canManage && !full ? (
        <ActionForm action={createShopTemplateAction.bind(null, orgSlug, editBase ?? null)} className="mb-4 grid gap-3 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
          <FormField label="ชื่อ template" name="name" required>
            <Input id="name" name="name" maxLength={80} required placeholder="เช่น กรอบงานแต่ง คุณเอ & คุณบี" />
          </FormField>
          <FormField label="ชนิด" name="kind">
            <Select id="kind" name="kind" defaultValue="photo-4x6">
              <option value="photo-4x6">กรอบภาพ 4x6</option>
              <option value="badge">กรอบเข็มกลัด</option>
            </Select>
          </FormField>
          <SubmitButton>สร้างและอัปโหลดไฟล์</SubmitButton>
        </ActionForm>
      ) : full && canManage ? (
        <p className="mb-4 text-sm text-warning-700">
          {quota === 0 ? 'ผู้ให้บริการปิดการอัปโหลด template ของร้านอยู่ • template เดิมยังดูได้ ติดต่อผู้ให้บริการเพื่อเปิดอีกครั้ง' : 'ครบจำนวนที่ผู้ให้บริการอนุญาตแล้ว เลิกใช้แบบเก่าเพื่อเพิ่มแบบใหม่ หรือติดต่อผู้ให้บริการ'}
        </p>
      ) : null}

      {rows.length ? (
        <ul className="divide-y divide-ink-100">
          {rows.map((t) => (
            <li key={`${t.kind}:${t.id}`} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-ink-900">{t.name ?? t.id}</p>
                <p className="text-xs text-ink-500">
                  {KIND_LABEL[t.kind] ?? t.kind} • แก้ไขล่าสุด {formatDateTime(t.updatedAt)}
                </p>
              </div>
              {t.status === 'published' ? <Badge tone="success" dot>เผยแพร่ v{t.publishedVersion}</Badge> : t.status === 'draft' ? <Badge tone="warning" dot>ร่าง</Badge> : <Badge dot>เลิกใช้</Badge>}
              {canManage ? (
                <>
                  <Link href={`${editBase ?? `/o/${orgSlug}/templates`}/${t.kind}/${t.id}/edit`} className={buttonClass('outline', 'sm')}>
                    แก้ไข
                  </Link>
                  {t.publishedVersion ? <ShopStatusButton orgSlug={orgSlug} kind={t.kind} id={t.id} retired={t.status === 'retired'} /> : null}
                </>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-500">ยังไม่มี template ของร้าน</p>
      )}
    </Card>
  );
}
