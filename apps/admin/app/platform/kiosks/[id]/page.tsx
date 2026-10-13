import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Activity, Archive, ArrowRight, Check, Cpu, History, Power, PowerOff, Printer, Undo2, Unlink } from 'lucide-react';
import { requirePlatform } from '@/server/auth/context';
import { canPlatform } from '@/server/auth/rbac';
import { getPlatformKiosk, kioskTimeline } from '@/server/services/kiosks';
import { shopBranchOptions } from '@/server/services/kiosk-stock';
import { ActionForm, FormField, SubmitButton } from '@/components/form';
import { AutoRefresh } from '@/components/auto-refresh';
import { ConnectionBadge, modeName } from '@/components/kiosk-badges';
import { Badge, Card, Input, Notice, Select } from '@/components/ui';
import { connectionOf, kioskIssues } from '@/lib/kiosk-status';
import { formatDateTime, formatRelative } from '@/lib/format';
import { JOURNEY, STAGE_INFO, TIMELINE_LABEL, journeyStep, kioskStage } from '@/lib/kiosk-lifecycle';
import { PairingPanel } from '@/app/o/[orgSlug]/(admin)/kiosks/[id]/pairing-panel';
import {
  archivePlatformAction,
  disablePlatformAction,
  enablePlatformAction,
  handToShopAction,
  resetLockAction,
  restorePlatformAction,
  returnToStockPlatformAction
} from '../actions';

export const metadata: Metadata = { title: 'ตู้' };

const PRINTER_ROLE: Record<string, string> = { main: 'หลัก / ใบรับรูป', photo: 'ภาพ 4x6', badge: 'เข็มกลัด' };

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-ink-100 py-2.5 text-sm last:border-0">
      <dt className="text-ink-500">{label}</dt>
      <dd className="text-right text-ink-900">{children}</dd>
    </div>
  );
}

/**
 * A kiosk's Platform page: where it is in its life, the one thing to do next, its status, and its
 * history. Everything about this kiosk is done here (settings in the next tab).
 */
export default async function PlatformKioskPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ key?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const platform = await requirePlatform();
  const canManage = canPlatform(platform.user.platformRole, 'platform.org.manage');
  const [{ kiosk: k, org }, timeline] = await Promise.all([getPlatformKiosk(id), kioskTimeline(id)]);
  const inStock = org.kind === 'stock';
  const stageId = kioskStage(k, inStock);
  const stage = STAGE_INFO[stageId];
  const step = journeyStep(stageId);
  const now = Date.now();
  const issues = kioskIssues(k, now).filter((i) => i.level !== 'info');
  const needsKey = stageId === 'stock_new' || stageId === 'shop_waiting' || stageId === 'shop_locked';
  const canHandOver = stageId === 'stock_ready' || stageId === 'stock_new';
  const shops = canManage && canHandOver ? await shopBranchOptions() : [];
  const publicUrl = process.env.ADMIN_PUBLIC_URL?.replace(/\/+$/, '');

  return (
    <div className="flex flex-col gap-6">
      {k.status === 'active' ? <AutoRefresh seconds={20} /> : null}

      {/* Where the kiosk is in its life */}
      {stageId !== 'archived' ? (
        <ol className="flex flex-wrap items-center gap-2" aria-label="ขั้นตอนของตู้">
          {JOURNEY.map((label, i) => {
            const done = i < step;
            const current = i === step;
            const skipped = !inStock && i < 3 && !k.formerKioskId && done; // registered straight for the shop
            return (
              <li key={label} className="flex items-center gap-2">
                <span
                  aria-current={current ? 'step' : undefined}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ${current ? 'bg-primary-600 text-white' : done ? 'bg-emerald-50 text-emerald-700' : 'bg-ink-100 text-ink-500'} ${skipped ? 'opacity-50' : ''}`}
                >
                  {done ? <Check className="size-4" aria-hidden /> : <span className="text-xs">{i + 1}</span>}
                  {label}
                </span>
                {i < JOURNEY.length - 1 ? <ArrowRight className="size-4 text-ink-300" aria-hidden /> : null}
              </li>
            );
          })}
        </ol>
      ) : null}

      {/* The one thing to do next, for this stage */}
      <Card title="ขั้นตอนถัดไป" subtitle={stage.next}>
        <div className="flex flex-col gap-5">
          {issues.length ? (
            <div className="flex flex-wrap gap-2">
              {issues.map((i) => (
                <Badge key={i.text} tone={i.level === 'danger' ? 'danger' : 'warning'} dot>
                  {i.text}
                </Badge>
              ))}
            </div>
          ) : null}

          {needsKey && canManage ? (
            <div>
              <p className="mb-2 text-sm font-semibold text-ink-900">{inStock ? 'Key สำหรับช่างทดสอบ' : `Key สำหรับร้าน ${org.name}`}</p>
              <PairingPanel orgSlug={org.slug} kioskRowId={k.id} autoStart={sp.key === '1'} kind="key" publicUrl={publicUrl} />
            </div>
          ) : null}

          {canHandOver && canManage ? (
            <div className={needsKey ? 'border-t border-ink-100 pt-5' : ''}>
              <p className="mb-1 text-sm font-semibold text-ink-900">มอบให้ร้าน</p>
              <p className="mb-3 text-sm text-ink-500">
                {stageId === 'stock_new' ? 'ข้ามการทดสอบได้ถ้าไม่จำเป็น • ' : ''}ตู้จะย้ายไปอยู่กับร้าน ใช้ค่ากลางของร้าน และได้ Key ใหม่ให้ร้านลงทะเบียน
              </p>
              {shops.length ? (
                <ActionForm action={handToShopAction.bind(null, k.id)} className="flex flex-wrap items-end gap-3">
                  <FormField label="ร้านและสาขา" name="target">
                    <Select id="target" name="target" defaultValue={shops[0]!.value} wrapperClassName="w-80">
                      {shops.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                  <SubmitButton>มอบให้ร้านและออก Key</SubmitButton>
                </ActionForm>
              ) : (
                <Notice tone="info">ยังไม่มีร้านที่มีสาขาใช้งาน เพิ่มที่เมนู &quot;บัญชีลูกค้า&quot;</Notice>
              )}
            </div>
          ) : null}

          {canManage ? (
            <div className="flex flex-wrap gap-3">
              {stageId === 'stock_testing' ? (
                <ActionForm action={resetLockAction.bind(null, k.id)} confirm={`รีเซ็ตและล็อก "${k.name}"? ตู้ล้างค่าที่ได้จาก Admin และล็อกจนกว่าจะใส่ Key ใหม่ (พร้อมส่งให้ร้าน)`}>
                  <SubmitButton>
                    <Unlink className="size-4" aria-hidden />
                    ทดสอบเสร็จ: รีเซ็ตและล็อก
                  </SubmitButton>
                </ActionForm>
              ) : null}
              {stageId === 'shop_disabled' ? (
                <ActionForm action={enablePlatformAction.bind(null, k.id)} confirm={`เปิดการใช้งาน "${k.name}"?`}>
                  <SubmitButton>
                    <Power className="size-4" aria-hidden />
                    เปิดการใช้งาน
                  </SubmitButton>
                </ActionForm>
              ) : null}
              {stageId === 'shop_active' ? (
                <details className="relative">
                  <summary className="inline-flex h-10 cursor-pointer list-none items-center gap-2 rounded-control border border-red-200 px-4 text-sm font-medium text-red-700 hover:bg-red-50">
                    <PowerOff className="size-4" aria-hidden />
                    ปิดการใช้งานชั่วคราว
                  </summary>
                  <div className="absolute left-0 z-20 mt-2 w-80 rounded-card border border-ink-200 bg-surface p-4 shadow-lg">
                    <ActionForm action={disablePlatformAction.bind(null, k.id)} className="flex flex-col gap-3">
                      <FormField label="เหตุผล (ร้านเห็นในหน้า Admin)" name="reason" required>
                        <Input id="disable-reason" name="reason" required maxLength={255} placeholder="เช่น ค้างชำระค่าบริการ" />
                      </FormField>
                      <SubmitButton variant="danger" size="sm">
                        ยืนยันปิดการใช้งาน
                      </SubmitButton>
                    </ActionForm>
                  </div>
                </details>
              ) : null}
              {stageId === 'shop_active' || stageId === 'shop_disabled' ? (
                <ActionForm action={resetLockAction.bind(null, k.id)} confirm={`รีเซ็ตและล็อก "${k.name}"? ตู้ล้างการตั้งค่าจาก Admin และล็อกจนกว่าจะใส่ Key ใหม่ (ใช้ก่อนย้ายร้านหรือคืนคลัง)`}>
                  <SubmitButton variant="secondary">
                    <Unlink className="size-4" aria-hidden />
                    รีเซ็ตและล็อก
                  </SubmitButton>
                </ActionForm>
              ) : null}
              {stageId === 'shop_waiting' || stageId === 'shop_locked' ? (
                <ActionForm action={returnToStockPlatformAction.bind(null, k.id)} confirm={`คืน "${k.name}" เข้าคลัง? Key ที่ออกไว้จะใช้ไม่ได้`}>
                  <SubmitButton variant="secondary">
                    <Undo2 className="size-4" aria-hidden />
                    คืนเข้าคลัง
                  </SubmitButton>
                </ActionForm>
              ) : null}
              {stageId === 'archived' ? (
                <ActionForm action={restorePlatformAction.bind(null, k.id)} confirm={`นำ "${k.name}" กลับมาใช้? ตู้จะรอลงทะเบียนใหม่ (นับในโควตา)`}>
                  <SubmitButton>
                    <Undo2 className="size-4" aria-hidden />
                    นำกลับมาใช้
                  </SubmitButton>
                </ActionForm>
              ) : null}
            </div>
          ) : (
            <Notice tone="info">บัญชีของคุณดูได้อย่างเดียว</Notice>
          )}

          {stageId === 'archived' ? (
            <Notice tone="warn" title={`ยกเลิกเมื่อ ${formatDateTime(k.archivedAt)}`}>
              {k.archivedReason ? `เหตุผล: ${k.archivedReason}` : 'ไม่ได้ระบุเหตุผล'}
            </Notice>
          ) : null}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="สถานะ" subtitle="จาก heartbeat ล่าสุด" icon={<Activity aria-hidden />}>
          <dl>
            <Row label="การเชื่อมต่อ">{stageId === 'archived' ? '—' : <ConnectionBadge connection={connectionOf(k, now)} />}</Row>
            <Row label="ติดต่อล่าสุด">{k.lastSeenAt ? `${formatRelative(k.lastSeenAt, now)} (${formatDateTime(k.lastSeenAt)})` : '—'}</Row>
            <Row label="โหมด">{modeName(k.mode)}</Row>
            <Row label="หน้าจอปัจจุบัน">{k.screen || '—'}</Row>
            <Row label="การตั้งค่า">{k.currentRevision ? `ใช้ revision ${k.appliedRevision ?? '—'} / ล่าสุด ${k.currentRevision}` : '—'}</Row>
            <Row label="โหมดฉุกเฉิน">{k.emergency ? <Badge tone="warning">เปิดที่ตู้ ตั้งแต่ {formatDateTime(new Date(k.emergency.since))}</Badge> : 'ไม่'}</Row>
          </dl>
        </Card>

        <Card title="อุปกรณ์และเครื่อง" icon={<Cpu aria-hidden />}>
          <dl>
            <Row label="Kiosk ID">
              <span className="font-mono">{k.kioskId ?? (k.formerKioskId ? `${k.formerKioskId} (เดิม)` : '—')}</span>
            </Row>
            <Row label="ชื่อเครื่อง">{k.hostname ?? '—'}</Row>
            <Row label="IP">{k.ip ?? '—'}</Row>
            <Row label="เวอร์ชันโปรแกรม">{k.appVersion ?? '—'}</Row>
            {(k.printerState ?? []).map((p) => (
              <Row key={p.role} label={`เครื่องพิมพ์${PRINTER_ROLE[p.role] ?? p.role}`}>
                <span className="inline-flex items-center gap-2">
                  <Printer className="size-4 text-ink-400" aria-hidden />
                  {p.name || '—'} {p.ok ? <Badge tone="success">พร้อม</Badge> : <Badge tone="danger">มีปัญหา</Badge>}
                </span>
              </Row>
            ))}
          </dl>
        </Card>
      </div>

      <Card title="ประวัติของตู้" subtitle="ทุกบัญชีที่ตู้นี้เคยอยู่" icon={<History aria-hidden />}>
        {timeline.length || k.pairedAt ? (
          <ol className="flex flex-col">
            {timeline.map((t, i) => (
              <li key={`${t.action}-${t.at.getTime()}-${i}`} className="flex gap-4 border-b border-ink-100 py-3 text-sm last:border-0">
                <span className="w-40 shrink-0 text-ink-500">{formatDateTime(t.at)}</span>
                <span className="flex-1">
                  <span className="font-medium text-ink-900">{TIMELINE_LABEL[t.action] ?? t.action}</span>
                  {t.action === 'kiosk.archive' && (t.after as { reason?: string } | null)?.reason ? <span className="text-ink-600"> • {(t.after as { reason: string }).reason}</span> : null}
                  {t.action === 'kiosk.disable' && (t.after as { reason?: string } | null)?.reason ? <span className="text-ink-600"> • {(t.after as { reason: string }).reason}</span> : null}
                  <span className="block text-xs text-ink-500">
                    {t.orgName ? `${t.orgName} • ` : ''}
                    {t.userName ? `โดย ${t.userName}` : 'โดยระบบ'}
                  </span>
                </span>
              </li>
            ))}
            {k.pairedAt ? (
              <li className="flex gap-4 py-3 text-sm">
                <span className="w-40 shrink-0 text-ink-500">{formatDateTime(k.pairedAt)}</span>
                <span className="font-medium text-ink-900">ลงทะเบียนที่ตู้ครั้งล่าสุด</span>
              </li>
            ) : null}
          </ol>
        ) : (
          <p className="text-sm text-ink-500">ยังไม่มีประวัติ</p>
        )}
      </Card>

      {canManage && stageId !== 'archived' ? (
        <Card title="ยกเลิกตู้" subtitle="เลิกใช้ตู้นี้ถาวร: ตัดการเชื่อมต่อและเก็บเป็นประวัติ ข้อมูลไม่ถูกลบ นำกลับมาใช้ได้" icon={<Archive aria-hidden />}>
          <ActionForm action={archivePlatformAction.bind(null, k.id)} confirm={`ยกเลิกตู้ "${k.name}"? ตู้จะถูกตัดการเชื่อมต่อและย้ายไปแท็บ "ยกเลิกแล้ว"`} className="flex flex-wrap items-end gap-3">
            <FormField label="เหตุผล (ไม่บังคับ)" name="reason">
              <Input id="archive-reason" name="reason" maxLength={255} placeholder="เช่น เครื่องเสีย จบสัญญาเช่า" className="min-w-72" />
            </FormField>
            <SubmitButton variant="danger">ยกเลิกตู้</SubmitButton>
          </ActionForm>
        </Card>
      ) : null}
    </div>
  );
}
