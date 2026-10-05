import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Ban, ChevronLeft, Download, History, ImageIcon, Printer, ReceiptText, RotateCcw } from 'lucide-react';
import { formatPickupCode } from '@photobooth/contracts';
import { requireOrg } from '@/server/auth/context';
import { can } from '@/server/auth/rbac';
import { effectiveStatus, getOrder } from '@/server/services/orders';
import { AppError } from '@/server/lib/errors';
import { ActionForm, SubmitButton } from '@/components/form';
import { Badge, Card, DetailRow, Notice, PageHeader } from '@/components/ui';
import { FLAG_LABELS, PAYMENT_LABELS, productLabel, statusLabel } from '@/lib/order-labels';
import { formatBaht, formatDateTime } from '@/lib/format';
import { allowReprintAction, orderCommandAction } from '../actions';
import { orderPrintState } from '@/server/services/kiosk-commands';
import { AutoRefresh } from '@/components/auto-refresh';

const JOB_KIND: Record<string, string> = { photo: 'แผ่นภาพ', badge: 'แผ่นเข็มกลัด', slip: 'ใบคิว' };
const JOB_STATUS: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral' }> = {
  queued: { label: 'รอพิมพ์', tone: 'info' },
  printing: { label: 'กำลังพิมพ์', tone: 'warning' },
  printed: { label: 'พิมพ์แล้ว', tone: 'success' },
  failed: { label: 'ล้มเหลว', tone: 'danger' },
  cancelled: { label: 'ยกเลิกแล้ว', tone: 'neutral' }
};
const CMD_LABEL: Record<string, string> = { reprint: 'พิมพ์ซ้ำ', cancel_print: 'ยกเลิกคิวพิมพ์' };
const CMD_STATUS: Record<string, string> = { pending: 'รอตู้รับคำสั่ง', sent: 'ตู้กำลังทำ', done: 'สำเร็จ', failed: 'ไม่สำเร็จ' };

export const metadata: Metadata = { title: 'ออเดอร์' };

const FILE_LABELS: Record<string, string> = { photo: 'ภาพ 4x6', badge: 'เข็มกลัด', shot: 'ภาพถ่าย', ai: 'ภาพ AI', receipt: 'ใบเสร็จ' };
const ITEM_LABELS: Record<string, string> = { photo: 'ภาพ', badge: 'เข็มกลัด', print: 'พิมพ์' };

export default async function OrderPage({ params }: { params: Promise<{ orgSlug: string; id: string }> }) {
  const { orgSlug, id } = await params;
  const ctx = await requireOrg(orgSlug, 'order.view');
  const o = await getOrder(ctx, id).catch((err) => {
    if (err instanceof AppError && err.code === 'not_found') notFound();
    throw err;
  });
  const status = effectiveStatus(o);
  const printState = o.fulfillment === 'kiosk' ? await orderPrintState(ctx, o.id) : null;
  const canAct = can(ctx.principal, 'console.act', { branchId: o.branchId });
  const busy = printState?.commands.some((c) => c.status === 'pending' || c.status === 'sent') || printState?.jobs.some((j) => j.status === 'printing' || j.status === 'queued');
  const st = statusLabel(status, o.fulfillment);
  const pay = PAYMENT_LABELS[o.paymentKind]!;
  const expired = status === 'expired' || (!!o.expiresAt && o.expiresAt.getTime() < Date.now());
  const product = productLabel(o.product, o.mode);
  const timeline = [
    { at: o.orderedAt, text: `สั่งซื้อที่ ${o.kioskName}` },
    o.printedAt ? { at: o.printedAt, text: 'พิมพ์ที่ตู้' } : null,
    o.claimedAt ? { at: o.claimedAt, text: `กดพิมพ์ที่จุดรับรูป${o.claimedStation ? ` (${o.claimedStation})` : ''}${o.claimedByName ? ` โดย ${o.claimedByName}` : ''}` } : null,
    o.handedOverAt ? { at: o.handedOverAt, text: 'ส่งมอบให้ลูกค้า' } : null
  ].filter((x): x is { at: Date; text: string } => !!x);

  return (
    <>
      <PageHeader
        breadcrumb={
          <Link href={`/o/${ctx.org.slug}/orders`} className="inline-flex items-center gap-1 hover:text-ink-900">
            <ChevronLeft className="size-4" aria-hidden />
            ออเดอร์
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            {o.code ? <span className="font-mono tracking-wider">{formatPickupCode(o.code)}</span> : product}
            <Badge tone={st.tone} dot>
              {st.label}
            </Badge>
          </span>
        }
        description={`${product} • ${o.kioskName}${o.branchName ? ` (${o.branchName})` : ''}`}
      />

      {busy ? <AutoRefresh seconds={3} /> : null}
      {o.flags?.length ? (
        <Notice tone="danger" title="ออเดอร์นี้ต้องตรวจสอบ" className="mb-5">
          {o.flags.map((f) => FLAG_LABELS[f] ?? f).join(' • ')} ยอดนี้นับเป็นเงินจริงตามที่ตู้แจ้ง ติดต่อผู้ดูแลแพลตฟอร์มเพื่อตรวจสอบกับ Stripe
        </Notice>
      ) : null}
      <div className="grid gap-5 xl:grid-cols-3">
        <Card title="ภาพ" subtitle={expired ? 'ภาพถูกลบตามเวลาที่ตั้งแล้ว' : o.expiresAt ? `เก็บถึง ${formatDateTime(o.expiresAt)}` : undefined} icon={<ImageIcon aria-hidden />} className="xl:col-span-2">
          {o.files.length && !expired ? (
            <div className="flex flex-wrap gap-5">
              {o.files.map((f) => (
                <figure key={f.id}>
                  <a href={f.url} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.url} alt={FILE_LABELS[f.kind] ?? f.kind} className={f.kind === 'badge' ? 'size-44 rounded-full border border-ink-200 object-cover shadow-card' : 'h-72 w-auto rounded-lg border border-ink-200 bg-ink-50 object-contain shadow-card'} />
                  </a>
                  <figcaption className="mt-1 text-center text-sm text-ink-500">{FILE_LABELS[f.kind] ?? f.kind}</figcaption>
                </figure>
              ))}
            </div>
          ) : o.hasThumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/o/${ctx.org.slug}/orders/${o.id}/thumb`} alt="ภาพย่อของออเดอร์" className="h-72 w-auto rounded-lg border border-ink-200 bg-ink-50 object-contain shadow-card" />
          ) : (
            <p className="text-ink-500">{expired ? 'ภาพหมดอายุแล้ว' : 'ออเดอร์นี้ไม่มีไฟล์ภาพ (พิมพ์ที่ตู้)'}</p>
          )}
          {o.downloadUrl && !expired ? (
            <a href={o.downloadUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 text-sm text-ink-600 underline hover:text-ink-900">
              <Download className="size-4" aria-hidden />
              หน้าดาวน์โหลดของลูกค้า
            </a>
          ) : null}
        </Card>

        <div className="flex flex-col gap-5">
          <Card title="รายละเอียด" icon={<ReceiptText aria-hidden />}>
            <dl className="divide-y divide-ink-100">
              <DetailRow label="ยอด">
                <span className="font-semibold">{formatBaht(o.amountSatang / 100)}</span> <Badge tone={pay.tone}>{pay.label}</Badge>
              </DetailRow>
              <DetailRow label="รายการ">{o.items.map((i) => `${ITEM_LABELS[i.type] ?? i.type} × ${i.qty}`).join(', ')}</DetailRow>
              {o.badge ? <DetailRow label="เข็มกลัด">{`${o.badge.size} มม. × ${o.badge.copies} (${o.badge.frame})`}</DetailRow> : null}
              {o.templateId ? <DetailRow label="Template">{o.templateId}</DetailRow> : null}
              <DetailRow label="การรับภาพ">{o.fulfillment === 'pickup' ? 'จุดรับรูป' : 'พิมพ์ที่ตู้'}</DetailRow>
              {o.paymentRef ? <DetailRow label="อ้างอิงการชำระ">{o.paymentRef}</DetailRow> : null}
            </dl>
          </Card>

          <Card title="ไทม์ไลน์" icon={<History aria-hidden />}>
            <ol className="flex flex-col gap-3">
              {timeline.map((t, i) => (
                <li key={i} className="flex gap-3">
                  <span className="mt-2 size-2 shrink-0 rounded-full bg-primary-600" aria-hidden />
                  <span>
                    <span className="block text-ink-900">{t.text}</span>
                    <span className="text-sm text-ink-500">{formatDateTime(t.at)}</span>
                  </span>
                </li>
              ))}
            </ol>
          </Card>

          {printState ? (
            <Card title="การพิมพ์ที่ตู้" icon={<Printer aria-hidden />}>
              {printState.jobs.length ? (
                <ul className="flex flex-col gap-2">
                  {printState.jobs.map((j) => {
                    const js = JOB_STATUS[j.status] ?? { label: j.status, tone: 'neutral' as const };
                    return (
                      <li key={j.id} className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-ink-900">{JOB_KIND[j.kind] ?? j.kind}</span>
                        <Badge tone={js.tone} dot>
                          {js.label}
                        </Badge>
                        {j.attempts > 1 ? <span className="text-xs text-ink-500">พิมพ์ {j.attempts} ครั้ง</span> : null}
                        <span className="w-full text-xs text-ink-500">
                          {j.printer ?? ''}
                          {j.error ? ` • ${j.error}` : ''}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-ink-500">ยังไม่มีข้อมูลการพิมพ์จากตู้</p>
              )}
              {printState.commands.length ? (
                <ul className="mt-3 flex flex-col gap-1 border-t border-ink-100 pt-3 text-sm text-ink-600">
                  {printState.commands.slice(0, 5).map((c) => (
                    <li key={c.id}>
                      {CMD_LABEL[c.type] ?? c.type}: <span className="font-medium">{CMD_STATUS[c.status] ?? c.status}</span>
                      {c.message ? ` • ${c.message}` : ''} <span className="text-xs text-ink-400">({formatDateTime(c.createdAt)})</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {canAct ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <ActionForm action={orderCommandAction.bind(null, ctx.org.slug, o.id, 'reprint')} confirm="สั่งตู้พิมพ์ออเดอร์นี้อีกครั้ง?">
                    <SubmitButton variant="outline" size="sm">
                      <RotateCcw className="size-4" aria-hidden />
                      พิมพ์ซ้ำที่ตู้
                    </SubmitButton>
                  </ActionForm>
                  <ActionForm action={orderCommandAction.bind(null, ctx.org.slug, o.id, 'cancel_print')} confirm="ยกเลิกงานพิมพ์ของออเดอร์นี้ที่ยังค้างในคิวเครื่องพิมพ์?">
                    <SubmitButton variant="ghost" size="sm">
                      <Ban className="size-4" aria-hidden />
                      ยกเลิกคิวพิมพ์
                    </SubmitButton>
                  </ActionForm>
                </div>
              ) : null}
            </Card>
          ) : null}

          {o.fulfillment === 'pickup' && o.status === 'handed_over' && can(ctx.principal, 'order.reprint', { branchId: o.branchId }) ? (
            <Card title="พิมพ์ซ้ำ" icon={<RotateCcw aria-hidden />}>
              {o.reprintAllowance ? (
                <Notice tone="info">อนุญาตพิมพ์ซ้ำแล้ว {o.reprintAllowance} ครั้ง จุดรับรูปพิมพ์ได้ทันที</Notice>
              ) : (
                <ActionForm action={allowReprintAction.bind(null, ctx.org.slug, o.id)} confirm="อนุญาตให้จุดรับรูปพิมพ์ออเดอร์นี้ซ้ำ 1 ครั้ง?">
                  <p className="mb-3 text-sm text-ink-600">ใช้เมื่อภาพที่ส่งมอบเสียหาย หรือพิมพ์ไม่สำเร็จหลังกดยืนยัน</p>
                  <SubmitButton variant="outline">อนุญาตพิมพ์ซ้ำ 1 ครั้ง</SubmitButton>
                </ActionForm>
              )}
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
