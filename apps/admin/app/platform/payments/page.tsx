import type { Metadata } from 'next';
import Link from 'next/link';
import { Banknote, Landmark } from 'lucide-react';
import { requirePlatform } from '@/server/auth/context';
import { canPlatform } from '@/server/auth/rbac';
import { platformPaymentSummary } from '@/server/services/payment-accounts';
import { fillMissingFees, revenueByOrg } from '@/server/services/payments';
import { publicOrigin } from '@/server/lib/public-url';
import { periodFromParams } from '@/lib/period';
import { ActionForm, FormField, SubmitButton } from '@/components/form';
import { StripeKeysFields } from '@/components/stripe-keys-fields';
import { Badge, Card, EmptyState, Input, PageHeader, Select, Table, Td, Th, buttonClass } from '@/components/ui';
import { formatBaht, formatDateTime, formatNumber } from '@/lib/format';
import { savePlatformPaymentAction, testPlatformPaymentAction } from './actions';

export const metadata: Metadata = { title: 'การรับเงิน' };

const baht = (satang: number) => (satang / 100).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function PlatformPaymentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user } = await requirePlatform();
  const canManage = canPlatform(user.platformRole, 'platform.secrets');
  const sp = await searchParams;
  const period = periodFromParams(sp);
  const mode = sp.mode === 'test' ? 'test' : 'live';
  await fillMissingFees().catch(() => {});
  const [s, rows, origin] = await Promise.all([platformPaymentSummary(), revenueByOrg(period.from, period.to, mode), publicOrigin()]);
  const central = rows.filter((r) => r.account === 'platform');
  const own = rows.filter((r) => r.account === 'shop');
  const sum = (list: typeof rows, f: 'gross' | 'feeSatang' | 'netSatang' | 'count') => list.reduce((n, r) => n + Number(r[f]), 0);
  const query = `from=${period.fromDay}&to=${period.toDay}&mode=${mode}`;
  const anyKey = s.keys.live.secret || s.keys.test.secret;

  return (
    <div className="flex flex-col gap-5 pb-6">
      <PageHeader
        title="การรับเงิน"
        description="บัญชี Stripe กลางของบริษัท (ค่าเริ่มต้นของทุกร้าน) และยอดรับเงินแยกรายร้าน ร้านที่ได้รับอนุญาตใช้บัญชีของตัวเองได้ (เปิดที่หน้า ขีดจำกัดและสิทธิ์ ของร้าน)"
      />

      <Card
        title="บัญชี Stripe กลาง"
        subtitle="key เก็บแบบเข้ารหัส Secret key ไม่ส่งไปที่ตู้ (ตู้ได้เฉพาะ Restricted key สำหรับขายตอน Admin ล่ม) เว้นว่าง = ใช้ค่าเดิม"
        icon={<Landmark aria-hidden />}
        actions={
          anyKey ? (
            s.lastTestOk ? <Badge tone="success" dot>ทดสอบผ่าน</Badge> : s.lastTestOk === false ? <Badge tone="danger" dot>ทดสอบไม่ผ่าน</Badge> : <Badge dot>ยังไม่ทดสอบ</Badge>
          ) : (
            <Badge tone="warning" dot>ยังไม่ตั้ง</Badge>
          )
        }
      >
        <ActionForm action={savePlatformPaymentAction} className="flex flex-col gap-5">
          <fieldset disabled={!canManage} className="grid gap-5 sm:grid-cols-2">
            <StripeKeysFields keys={s.keys} webhookUrl={`${origin}/webhooks/stripe`} />
            <FormField label="อีเมลผู้จ่าย (Stripe บังคับสำหรับ PromptPay)" name="email" hint="ใช้อีเมลบริษัท ลูกค้าหน้าตู้ไม่ต้องกรอก">
              <Input id="email" name="email" type="email" defaultValue={s.email} placeholder="billing@company.co.th" />
            </FormField>
          </fieldset>
          {canManage ? (
            <div>
              <SubmitButton>บันทึก</SubmitButton>
            </div>
          ) : null}
        </ActionForm>
        {canManage && anyKey ? (
          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-ink-200 pt-4">
            {s.keys.test.secret ? (
              <ActionForm action={testPlatformPaymentAction.bind(null, 'test')}>
                <SubmitButton variant="outline" size="sm" pendingLabel="กำลังทดสอบ…">
                  ทดสอบโหมดทดสอบ
                </SubmitButton>
              </ActionForm>
            ) : null}
            {s.keys.live.secret ? (
              <ActionForm action={testPlatformPaymentAction.bind(null, 'live')}>
                <SubmitButton variant="outline" size="sm" pendingLabel="กำลังทดสอบ…">
                  ทดสอบโหมดจริง
                </SubmitButton>
              </ActionForm>
            ) : null}
            <span className="text-sm text-ink-500">
              {s.lastTestAt ? `ทดสอบล่าสุด ${formatDateTime(s.lastTestAt)} — ${s.lastTestMessage ?? ''}` : 'ยังไม่เคยทดสอบ'}
              {s.lastWebhookAt ? ` • webhook ล่าสุด ${formatDateTime(s.lastWebhookAt)}` : ' • ยังไม่เคยได้รับ webhook'}
            </span>
          </div>
        ) : null}
      </Card>

      <Card
        flush
        title={`ยอดรับเงิน ${period.fromDay} ถึง ${period.toDay} (${mode === 'live' ? 'เงินจริง' : 'โหมดทดสอบ'})`}
        subtitle="บัญชีกลาง = เงินเข้าบัญชีบริษัท ใช้ยอดสุทธิแบ่งรายได้ให้ร้าน (โอนนอกระบบ) • บัญชีร้าน = เงินเข้าบัญชีร้านโดยตรง แสดงเพื่อดูภาพรวม"
        icon={<Banknote aria-hidden />}
      >
        <div className="flex flex-wrap items-end gap-2 border-b border-ink-200 px-5 py-3">
          <form className="flex flex-wrap items-end gap-2" method="get">
            <label className="flex flex-col gap-1 text-xs text-ink-500">
              ตั้งแต่
              <Input type="date" name="from" defaultValue={period.fromDay} className="w-40" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-ink-500">
              ถึง
              <Input type="date" name="to" defaultValue={period.toDay} className="w-40" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-ink-500">
              โหมด
              <Select name="mode" defaultValue={mode} wrapperClassName="w-32">
                <option value="live">เงินจริง</option>
                <option value="test">ทดสอบ</option>
              </Select>
            </label>
            <button type="submit" className={buttonClass('outline', 'md')}>
              ดู
            </button>
          </form>
          <Link href={`/platform/payments/export?${query}`} className={buttonClass('secondary', 'md')} prefetch={false}>
            ดาวน์โหลด CSV
          </Link>
        </div>
        {rows.length ? (
          <Table bare>
            <thead>
              <tr>
                <Th>ร้าน</Th>
                <Th>บัญชีที่รับเงิน</Th>
                <Th className="text-right">รายการ</Th>
                <Th className="text-right">ยอดรวม</Th>
                <Th className="text-right">ค่าธรรมเนียม Stripe</Th>
                <Th className="text-right">ยอดสุทธิ</Th>
              </tr>
            </thead>
            <tbody>
              {[...central, ...own].map((r) => (
                <tr key={`${r.orgId}-${r.account}`}>
                  <Td>
                    <Link href={`/platform/organizations/${r.orgId}`} className="font-medium text-ink-900 hover:underline">
                      {r.name}
                    </Link>
                  </Td>
                  <Td>{r.account === 'platform' ? <Badge tone="primary">บัญชีกลาง</Badge> : <Badge tone="violet">บัญชีร้าน</Badge>}</Td>
                  <Td className="text-right tabular-nums">{formatNumber(Number(r.count))}</Td>
                  <Td className="text-right tabular-nums">{formatBaht(Number(r.gross))}</Td>
                  <Td className="text-right tabular-nums">
                    ฿{baht(Number(r.feeSatang))}
                    {Number(r.missingFee) ? <span className="block text-xs text-ink-500">ยังไม่ทราบ {Number(r.missingFee)} รายการ</span> : null}
                  </Td>
                  <Td className="text-right font-semibold tabular-nums">฿{baht(Number(r.netSatang))}</Td>
                </tr>
              ))}
              <tr className="bg-ink-50 font-semibold">
                <Td>รวมบัญชีกลาง</Td>
                <Td />
                <Td className="text-right tabular-nums">{formatNumber(sum(central, 'count'))}</Td>
                <Td className="text-right tabular-nums">{formatBaht(sum(central, 'gross'))}</Td>
                <Td className="text-right tabular-nums">฿{baht(sum(central, 'feeSatang'))}</Td>
                <Td className="text-right tabular-nums">฿{baht(sum(central, 'netSatang'))}</Td>
              </tr>
            </tbody>
          </Table>
        ) : (
          <div className="p-5">
            <EmptyState title="ยังไม่มีรายการรับเงินในช่วงนี้" />
          </div>
        )}
      </Card>
    </div>
  );
}
