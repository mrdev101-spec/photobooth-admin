import { HardDrive } from 'lucide-react';
import type { StorageSummary } from '@/server/services/storage';
import { ActionForm, FormField, SubmitButton } from '@/components/form';
import { Badge, Card, Input } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import { saveStorageAction, testStorageAction } from '../actions';

/**
 * Per-customer R2 bucket. Keys are write-only here: leave them blank to keep the stored ones.
 * Checklist for a new customer is in the hint so onboarding doesn't depend on memory.
 */
export function StorageCard({ orgId, s, canManage }: { orgId: string; s: StorageSummary; canManage: boolean }) {
  return (
    <Card
      title="พื้นที่เก็บภาพ (Cloudflare R2)"
      subtitle="bucket แยกเฉพาะลูกค้ารายนี้ key ส่งลงตู้แบบเข้ารหัส"
      icon={<HardDrive aria-hidden />}
      actions={s.configured ? s.lastTestOk ? <Badge tone="success" dot>ทดสอบผ่าน</Badge> : s.lastTestOk === false ? <Badge tone="danger" dot>ทดสอบไม่ผ่าน</Badge> : <Badge dot>ยังไม่ทดสอบ</Badge> : <Badge tone="warning" dot>ยังไม่ตั้ง</Badge>}
    >
      <details className="mb-4 text-sm text-ink-600" open={!s.configured}>
        <summary className="cursor-pointer font-medium">ขั้นตอนเตรียม bucket ให้ลูกค้าใหม่</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Cloudflare › R2 › Create bucket ชื่อเฉพาะลูกค้านี้ (เช่น pb-party-booth)</li>
          <li>เปิด Public access (custom domain หรือ r2.dev) แล้วคัดลอก URL มาใส่ช่อง Public URL</li>
          <li>ตั้ง Lifecycle rule: prefix <code>p/</code> ลบหลัง N วัน (ตรงกับช่อง "ลบภาพหลัง")</li>
          <li>R2 › Manage API tokens › สร้าง token สิทธิ์ Object Read &amp; Write <b>เฉพาะ bucket นี้</b></li>
          <li>กรอกด้านล่าง กดบันทึก แล้วกด "ทดสอบการเชื่อมต่อ"</li>
        </ol>
      </details>

      {canManage ? (
        <ActionForm action={saveStorageAction.bind(null, orgId)} className="grid gap-4 sm:grid-cols-2">
          <FormField label="Account ID" name="accountId">
            <Input id="accountId" name="accountId" defaultValue={s.accountId ?? ''} required maxLength={32} autoComplete="off" />
          </FormField>
          <FormField label="Bucket" name="bucket">
            <Input id="bucket" name="bucket" defaultValue={s.bucket ?? ''} required maxLength={63} autoComplete="off" />
          </FormField>
          <FormField label="Public URL" name="publicUrl" hint="ลิงก์ที่ลูกค้าสแกนเปิดภาพ">
            <Input id="publicUrl" name="publicUrl" type="url" defaultValue={s.publicUrl ?? ''} required placeholder="https://img.example.com" />
          </FormField>
          <FormField label="Endpoint (ไม่บังคับ)" name="endpoint" hint="เว้นว่าง = https://<account>.r2.cloudflarestorage.com">
            <Input id="endpoint" name="endpoint" type="url" defaultValue={s.endpoint ?? ''} />
          </FormField>
          <FormField label="Access Key ID" name="accessKeyId" hint={s.configured ? `ตั้งไว้แล้ว (…${s.keyHint}) เว้นว่างเพื่อใช้ค่าเดิม` : undefined}>
            <Input id="accessKeyId" name="accessKeyId" autoComplete="off" required={!s.configured} />
          </FormField>
          <FormField label="Secret Access Key" name="secretAccessKey">
            <Input id="secretAccessKey" name="secretAccessKey" type="password" autoComplete="new-password" required={!s.configured} />
          </FormField>
          <FormField label="ลบภาพหลัง (ตาม lifecycle rule)" name="lifecycleDays">
            <Input id="lifecycleDays" name="lifecycleDays" type="number" min={1} max={365} defaultValue={s.lifecycleDays ?? 7} required />
          </FormField>
          <div className="flex items-end">
            <SubmitButton>บันทึก</SubmitButton>
          </div>
          <p className="text-xs text-ink-500 sm:col-span-2">
            เมื่อเปลี่ยน bucket หรือ key ตู้ทุกเครื่องของลูกค้านี้จะได้รับค่าใหม่อัตโนมัติ (สร้าง revision ใหม่ให้ทุกตู้) — ใช้หมุน key เมื่อเครื่องหายได้
          </p>
        </ActionForm>
      ) : (
        <dl className="grid gap-1 text-sm">
          <div>Bucket: {s.bucket ?? '—'}</div>
          <div>Public URL: {s.publicUrl ?? '—'}</div>
        </dl>
      )}

      {s.configured && canManage ? (
        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-ink-200 pt-4">
          <ActionForm action={testStorageAction.bind(null, orgId)}>
            <SubmitButton variant="outline" size="sm" pendingLabel="กำลังทดสอบ…">
              ทดสอบการเชื่อมต่อ
            </SubmitButton>
          </ActionForm>
          <span className="text-sm text-ink-500">
            {s.lastTestAt ? `ทดสอบล่าสุด ${formatDateTime(s.lastTestAt)}${s.lastTestError ? ` — ${s.lastTestError}` : ''}` : 'ยังไม่เคยทดสอบ'} • secrets v{s.secretsVersion}
          </span>
        </div>
      ) : null}
    </Card>
  );
}
