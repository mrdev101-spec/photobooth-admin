import type { Metadata } from 'next';
import { CircleAlert, Landmark, Link2, ReceiptText } from 'lucide-react';
import { requireOrg } from '@/server/auth/context';
import { can } from '@/server/auth/rbac';
import { orgPaymentSummary } from '@/server/services/payment-accounts';
import { orgPayments, unservedAiPayments } from '@/server/services/payments';
import { publicOrigin } from '@/server/lib/public-url';
import { ActionForm, FormField, SubmitButton } from '@/components/form';
import { StripeKeysFields } from '@/components/stripe-keys-fields';
import { Badge, Card, DetailRow, EmptyState, Input, Notice, PageHeader, Table, Td, Th } from '@/components/ui';
import { formatBaht, formatDateTime } from '@/lib/format';
import { saveOrgPaymentAction, testOrgPaymentAction } from './actions';

export const metadata: Metadata = { title: 'การรับเงิน' };

const STATUS: Record<string, { label: string; tone: 'success' | 'danger' | 'info' | 'neutral' }> = {
  succeeded: { label: 'ชำระแล้ว', tone: 'success' },
  requires_action: { label: 'รอสแกน', tone: 'info' },
  processing: { label: 'กำลังตรวจ', tone: 'info' },
  canceled: { label: 'ยกเลิก/หมดเวลา', tone: 'neutral' },
  failed: { label: 'ไม่สำเร็จ', tone: 'danger' }
};

export default async function PaymentsSettingsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const ctx = await requireOrg(orgSlug, 'payment.view');
  const canManage = can(ctx.principal, 'org.settings');
  const [s, list, origin, unserved] = await Promise.all([orgPaymentSummary(ctx.org), orgPayments(ctx.org.id, 30), publicOrigin(), unservedAiPayments(ctx.org.id)]);
  const unservedIds = new Set(unserved.map((p) => p.id));

  return (
    <>
      <PageHeader title="การรับเงิน" description="ตู้รับเงินผ่าน QR PromptPay (Stripe) ตามบัญชีด้านล่าง" />
      <div className="flex flex-col gap-5 pb-6">
        <Card className="max-w-3xl" title="บัญชีที่รับเงินตอนนี้" icon={<Landmark aria-hidden />}>
          <dl className="divide-y divide-ink-100">
            <DetailRow label="รับเงินเข้า">
              {s.inUse ? <Badge tone="violet" dot>บัญชี Stripe ของร้าน{s.accountName ? ` (${s.accountName})` : ''}</Badge> : <Badge tone="primary" dot>บัญชีกลางของผู้ให้บริการ</Badge>}
            </DetailRow>
            <DetailRow label="รับเงินจริง">{ctx.org.livePaymentsAllowed ? <Badge tone="success" dot>อนุญาต</Badge> : <Badge dot>ยังไม่อนุญาต (ใช้โหมดทดสอบ)</Badge>}</DetailRow>
          </dl>
          <p className="mt-3 text-sm text-ink-500">
            {s.inUse
              ? 'เงินเข้าบัญชี Stripe ของร้านโดยตรง ค่าธรรมเนียม Stripe เรียกเก็บจากบัญชีของร้าน'
              : 'เงินเข้าบัญชีบริษัทผู้ให้บริการ แล้วผู้ให้บริการโอนส่วนของร้านตามรอบที่ตกลงกัน'}
          </p>
        </Card>

        {s.allowed ? (
          <Card
            className="max-w-3xl"
            title="บัญชี Stripe ของร้าน"
            subtitle="ผู้ให้บริการเปิดสิทธิ์ให้ร้านนี้ใช้บัญชีของตัวเองแล้ว key เก็บแบบเข้ารหัส ไม่ส่งไปที่ตู้"
            icon={<Link2 aria-hidden />}
            actions={s.lastTestOk ? <Badge tone="success" dot>ทดสอบผ่าน</Badge> : s.lastTestOk === false ? <Badge tone="danger" dot>ทดสอบไม่ผ่าน</Badge> : null}
          >
            {canManage ? (
              <>
                <ActionForm action={saveOrgPaymentAction.bind(null, ctx.org.slug)} className="flex flex-col gap-5">
                  <label className="flex items-start gap-3 rounded-lg border border-ink-200 p-4">
                    <input type="checkbox" name="active" defaultChecked={s.active} className="mt-1 size-5 accent-primary-600" />
                    <span>
                      <span className="font-semibold text-ink-900">รับเงินเข้าบัญชี Stripe ของร้าน</span>
                      <span className="block text-sm text-ink-500">ปิด = กลับไปใช้บัญชีกลาง (key ที่ใส่ไว้ยังเก็บอยู่) • รายการที่สร้างไปแล้วยังอยู่กับบัญชีเดิม</span>
                    </span>
                  </label>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <StripeKeysFields keys={s.keys} webhookUrl={`${origin}/webhooks/stripe/${ctx.org.id}`} />
                    <FormField label="อีเมลผู้จ่าย (Stripe บังคับสำหรับ PromptPay)" name="email" hint="เว้นว่าง = ใช้อีเมลของผู้ให้บริการ">
                      <Input id="email" name="email" type="email" defaultValue={s.email} />
                    </FormField>
                  </div>
                  <div>
                    <SubmitButton>บันทึก</SubmitButton>
                  </div>
                </ActionForm>
                {s.keys.test.secret || s.keys.live.secret ? (
                  <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-ink-200 pt-4">
                    {s.keys.test.secret ? (
                      <ActionForm action={testOrgPaymentAction.bind(null, ctx.org.slug, 'test')}>
                        <SubmitButton variant="outline" size="sm" pendingLabel="กำลังทดสอบ…">
                          ทดสอบโหมดทดสอบ
                        </SubmitButton>
                      </ActionForm>
                    ) : null}
                    {s.keys.live.secret ? (
                      <ActionForm action={testOrgPaymentAction.bind(null, ctx.org.slug, 'live')}>
                        <SubmitButton variant="outline" size="sm" pendingLabel="กำลังทดสอบ…">
                          ทดสอบโหมดจริง
                        </SubmitButton>
                      </ActionForm>
                    ) : null}
                    <span className="text-sm text-ink-500">
                      {s.lastTestAt ? `ทดสอบล่าสุด ${formatDateTime(s.lastTestAt)} — ${s.lastTestMessage ?? ''}` : 'ยังไม่เคยทดสอบ'}
                      {s.lastWebhookAt ? ` • webhook ล่าสุด ${formatDateTime(s.lastWebhookAt)}` : ''}
                    </span>
                  </div>
                ) : null}
                <div className="mt-5 rounded-lg border border-dashed border-ink-300 p-4 text-sm text-ink-500">
                  <span className="font-semibold text-ink-700">เชื่อมบัญชีด้วย Stripe Connect</span> — กดเชื่อมบัญชีโดยไม่ต้องใส่ key จะเปิดให้ใช้เมื่อผู้ให้บริการเปิดระบบ Connect
                </div>
              </>
            ) : (
              <p className="text-sm text-ink-500">เฉพาะเจ้าของบัญชีตั้งค่าบัญชี Stripe ของร้านได้</p>
            )}
          </Card>
        ) : (
          <Notice className="max-w-3xl" tone="info" title="อยากรับเงินเข้าบัญชี Stripe ของร้านเอง?">
            ติดต่อผู้ให้บริการเพื่อขอเปิดสิทธิ์ใช้บัญชีของร้าน จากนั้นเจ้าของบัญชีตั้งค่าได้ที่หน้านี้
          </Notice>
        )}

        {unserved.length ? (
          <Card flush title={`ชำระเงินแล้วแต่ยังไม่ได้รับภาพ AI (${unserved.length})`} icon={<CircleAlert aria-hidden />}>
            <p className="px-5 pt-1 pb-3 text-sm text-ink-600">
              ลูกค้าจ่ายเงินแล้วแต่สร้างภาพไม่สำเร็จ ให้ลูกค้าลองใหม่ที่ตู้ หรือคืนเงินในหน้า Stripe Dashboard ด้วยรหัส PaymentIntent ด้านล่าง
            </p>
            <Table bare>
              <thead>
                <tr>
                  <Th>ชำระเมื่อ</Th>
                  <Th>รายการ</Th>
                  <Th className="text-right">ยอด</Th>
                  <Th>Stripe PaymentIntent</Th>
                </tr>
              </thead>
              <tbody>
                {unserved.map((p) => (
                  <tr key={p.id}>
                    <Td className="whitespace-nowrap tabular-nums">{p.paidAt ? formatDateTime(p.paidAt) : '-'}</Td>
                    <Td>
                      {p.description || p.product}
                      {p.mode === 'test' ? <Badge className="ml-2">ทดสอบ</Badge> : null}
                    </Td>
                    <Td className="text-right tabular-nums">{formatBaht(p.amount)}</Td>
                    <Td className="font-mono text-sm">{p.stripeIntentId}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        ) : null}

        <Card flush title="รายการรับเงินล่าสุด" icon={<ReceiptText aria-hidden />}>
          {list.length ? (
            <Table bare>
              <thead>
                <tr>
                  <Th>เวลา</Th>
                  <Th>รายการ</Th>
                  <Th className="text-right">ยอด</Th>
                  <Th>สถานะ</Th>
                  <Th>บัญชี</Th>
                </tr>
              </thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p.id}>
                    <Td className="whitespace-nowrap tabular-nums">{formatDateTime(p.createdAt)}</Td>
                    <Td>
                      {p.description || p.product}
                      {p.mode === 'test' ? <Badge className="ml-2">ทดสอบ</Badge> : null}
                    </Td>
                    <Td className="text-right tabular-nums">{formatBaht(p.amount)}</Td>
                    <Td>
                      <Badge tone={STATUS[p.status]?.tone ?? 'neutral'}>{STATUS[p.status]?.label ?? p.status}</Badge>
                      {unservedIds.has(p.id) ? <Badge tone="danger" className="ml-2">ยังไม่ได้รับภาพ</Badge> : null}
                    </Td>
                    <Td className="text-sm text-ink-600">{p.account === 'shop' ? 'บัญชีร้าน' : 'บัญชีกลาง'}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <div className="p-5">
              <EmptyState title="ยังไม่มีรายการรับเงิน" />
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
