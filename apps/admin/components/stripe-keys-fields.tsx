import { FormField } from '@/components/form';
import { Badge, Input } from '@/components/ui';
import type { KeysSummary } from '@/server/services/payment-accounts';

const MODES = [
  { id: 'test', label: 'โหมดทดสอบ', secret: 'sk_test_…', note: 'ไม่มีเงินจริง ใช้ทดสอบ QR' },
  { id: 'live', label: 'โหมดจริง', secret: 'sk_live_…', note: 'รับเงินจริง' }
] as const;

/** Secret key + webhook signing secret per mode. Write-only: blank keeps the stored value. */
export function StripeKeysFields({ keys, webhookUrl }: { keys: KeysSummary; webhookUrl: string }) {
  return (
    <div className="grid gap-4 sm:col-span-2 lg:grid-cols-2">
      {MODES.map((m) => {
        const k = keys[m.id];
        return (
          <div key={m.id} className="flex min-w-0 flex-col gap-3 rounded-lg border border-ink-200 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-ink-900">{m.label}</span>
              {k.secret ? <Badge tone="success">key …{k.hint}</Badge> : <Badge>ไม่มี key</Badge>}
              {k.webhook ? <Badge tone="success">webhook</Badge> : <Badge tone="warning">ไม่มี webhook</Badge>}
              <span className="text-xs text-ink-500">{m.note}</span>
            </div>
            <FormField label="Secret key" name={`${m.id}Secret`} hint={k.secret ? 'เว้นว่าง = ใช้ key เดิม • แนะนำ Restricted key' : `${m.secret} หรือ Restricted key (rk_${m.id}_…)`}>
              <Input id={`${m.id}Secret`} name={`${m.id}Secret`} type="password" autoComplete="new-password" placeholder={k.secret ? `…${k.hint}` : m.secret} />
            </FormField>
            <FormField label="Webhook signing secret" name={`${m.id}Webhook`} hint={k.webhook ? 'เว้นว่าง = ใช้ค่าเดิม' : 'whsec_… จาก Stripe › Developers › Webhooks'}>
              <Input id={`${m.id}Webhook`} name={`${m.id}Webhook`} type="password" autoComplete="new-password" placeholder="whsec_…" />
            </FormField>
            {k.secret || k.webhook ? (
              <label className="flex items-center gap-2 text-sm text-ink-600">
                <input type="checkbox" name="clearKeys" value={m.id} className="size-4 accent-danger-600" /> ลบ key ของ{m.label}
              </label>
            ) : null}
          </div>
        );
      })}
      <div className="min-w-0 rounded-lg bg-ink-50 p-4 text-sm text-ink-600 lg:col-span-2">
        <div className="font-semibold text-ink-900">ตั้ง Webhook ใน Stripe</div>
        Stripe › Developers › Webhooks › Add endpoint ใส่ URL นี้ และเลือก event <code>payment_intent.succeeded</code>, <code>payment_intent.canceled</code>,{' '}
        <code>payment_intent.payment_failed</code> แล้วคัดลอก Signing secret มาใส่ด้านบน
        <code className="mt-2 block overflow-x-auto whitespace-nowrap rounded bg-white px-3 py-2 text-ink-900">{webhookUrl}</code>
        <span className="mt-1 block text-xs">ถ้ายังไม่มี webhook ระบบยังรู้ผลการจ่ายได้ (ถาม Stripe ทุก 2 วินาทีระหว่างลูกค้ารอ) แต่ webhook ทำให้รู้ผลเร็วและแน่นอนกว่า</span>
      </div>
    </div>
  );
}
