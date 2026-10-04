import type { Metadata } from 'next';
import Link from 'next/link';
import { KeyRound, MonitorSmartphone, Plus, Power, PowerOff, Settings2, Unlink } from 'lucide-react';
import { orgContextForPlatform, requirePlatform } from '@/server/auth/context';
import { canPlatform } from '@/server/auth/rbac';
import { kioskQuotaUsage, listKiosks } from '@/server/services/kiosks';
import { listBranches } from '@/server/services/branches';
import { ActionForm, FormField, SubmitButton } from '@/components/form';
import { AutoRefresh } from '@/components/auto-refresh';
import { ConnectionBadge, modeName } from '@/components/kiosk-badges';
import { Badge, Card, EmptyState, Input, Notice, Select, Table, Td, Th, buttonClass } from '@/components/ui';
import { connectionOf, kioskIssues } from '@/lib/kiosk-status';
import { formatDateTime, formatRelative } from '@/lib/format';
import { formatQuota, isFull } from '@/lib/quota';
import { PairingPanel } from '@/app/o/[orgSlug]/kiosks/[id]/pairing-panel';
import { disableKioskAction, enableKioskAction, registerKioskAction, unpairKioskPlatformAction } from '../actions';

export const metadata: Metadata = { title: 'ตู้ของลูกค้า' };

export default async function OrganizationKiosksPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pair?: string; new?: string; revoked?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const platform = await requirePlatform();
  const ctx = await orgContextForPlatform(platform, id);
  const canManage = canPlatform(platform.user.platformRole, 'platform.org.manage');
  const [rows, branches, quota] = await Promise.all([listKiosks(ctx, { includeRevoked: sp.revoked === '1' }), listBranches(ctx), kioskQuotaUsage(ctx)]);
  const activeBranches = branches.filter((b) => b.isActive);
  const pairing = sp.pair ? rows.find((r) => r.kiosk.id === sp.pair && (r.kiosk.status === 'pending' || r.kiosk.status === 'revoked')) : undefined;
  const base = `/platform/organizations/${id}/kiosks`;
  const now = Date.now();
  const full = isFull(quota.used, quota.quota);

  return (
    <div className="flex flex-col gap-5">
      <AutoRefresh seconds={20} />

      {pairing ? (
        <div>
          <p className="mb-2 font-semibold text-ink-900">รหัสจับคู่สำหรับ {pairing.kiosk.name}</p>
          <PairingPanel orgSlug={ctx.org.slug} kioskRowId={pairing.kiosk.id} autoStart={sp.new === '1'} />
        </div>
      ) : null}

      {canManage ? (
        <Card title="ลงทะเบียนตู้ใหม่ให้ลูกค้า" subtitle={`ใช้ ${formatQuota(quota.used, quota.quota)} ตู้ • หลังลงทะเบียนจะได้รหัสจับคู่สำหรับกรอกที่ตู้`} icon={<Plus aria-hidden />}>
          {full ? (
            <Notice tone="warn">ลูกค้ามีตู้ครบโควตาแล้ว เพิ่มโควตาได้ที่แท็บ “ขีดจำกัดและสิทธิ์”</Notice>
          ) : !activeBranches.length ? (
            <Notice tone="warn">ลูกค้ายังไม่มีสาขาที่ใช้งาน</Notice>
          ) : (
            <ActionForm action={registerKioskAction.bind(null, id)} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <FormField label="ชื่อตู้" name="name" required>
                <Input id="name" name="name" required maxLength={100} placeholder="Booth C — หน้าลานกิจกรรม" />
              </FormField>
              <FormField label="สาขา" name="branchId" required>
                <Select id="branchId" name="branchId" required defaultValue={activeBranches[0]!.id}>
                  {activeBranches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </FormField>
              <SubmitButton>ลงทะเบียนและสร้างรหัส</SubmitButton>
            </ActionForm>
          )}
        </Card>
      ) : null}

      <Card
        flush
        title="ตู้ทั้งหมดของลูกค้า"
        subtitle="ปิดการใช้งาน: ตู้หยุดรับลูกค้าและรับเงิน เปิดกลับได้ทันทีโดยไม่ต้องจับคู่ใหม่"
        icon={<MonitorSmartphone aria-hidden />}
        actions={
          <Link href={sp.revoked === '1' ? base : `${base}?revoked=1`} className={buttonClass('ghost', 'sm')}>
            {sp.revoked === '1' ? 'ซ่อนตู้ที่ยกเลิกแล้ว' : 'แสดงตู้ที่ยกเลิกแล้ว'}
          </Link>
        }
      >
        {rows.length ? (
          <Table bare>
            <thead>
              <tr>
                <Th>ตู้</Th>
                <Th>สถานะ</Th>
                <Th>สาขา / โหมด</Th>
                <Th>ต้องดูแล</Th>
                <Th className="text-right">จัดการ</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ kiosk: k, branchName }) => {
                const issues = kioskIssues(k, now).filter((i) => i.level !== 'info');
                return (
                  <tr key={k.id} className="align-top">
                    <Td>
                      <div className="font-semibold text-ink-900">{k.name}</div>
                      <div className="font-mono text-xs text-ink-500">{k.kioskId ?? k.formerKioskId ?? 'ยังไม่จับคู่'}</div>
                    </Td>
                    <Td>
                      <ConnectionBadge connection={connectionOf(k, now)} />
                      {k.status === 'active' ? <div className="mt-1 text-xs text-ink-500">{formatRelative(k.lastSeenAt, now)}</div> : null}
                      {k.status === 'disabled' ? (
                        <div className="mt-1 max-w-56 text-xs text-ink-500">
                          {k.disabledReason} · {formatDateTime(k.disabledAt)}
                        </div>
                      ) : null}
                    </Td>
                    <Td className="text-ink-600">
                      {branchName ?? '—'}
                      <div className="text-xs text-ink-500">{modeName(k.mode)}</div>
                    </Td>
                    <Td>
                      <div className="flex flex-col items-start gap-1">
                        {issues.length ? (
                          issues.slice(0, 2).map((i) => (
                            <Badge key={i.text} tone={i.level === 'danger' ? 'danger' : 'warning'} dot>
                              {i.text}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-ink-400">—</span>
                        )}
                      </div>
                    </Td>
                    <Td className="text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        {k.currentRevision > 0 && k.status !== 'revoked' ? (
                          <Link href={`/o/${ctx.org.slug}/kiosks/${k.id}/config`} className={buttonClass('outline', 'sm')}>
                            <Settings2 className="size-4" aria-hidden />
                            ตั้งค่า
                          </Link>
                        ) : null}
                        {canManage && (k.status === 'pending' || k.status === 'revoked') ? (
                          <Link href={`${base}?pair=${k.id}&new=1`} className={buttonClass('outline', 'sm')}>
                            <KeyRound className="size-4" aria-hidden />
                            สร้างรหัสจับคู่
                          </Link>
                        ) : null}
                        {canManage && k.status === 'disabled' ? (
                          <ActionForm action={enableKioskAction.bind(null, id, k.id)} confirm={`เปิดการใช้งาน "${k.name}"?`}>
                            <SubmitButton size="sm">
                              <Power className="size-4" aria-hidden />
                              เปิดการใช้งาน
                            </SubmitButton>
                          </ActionForm>
                        ) : null}
                        {canManage && k.status === 'active' ? (
                          <details className="relative text-left">
                            <summary className={`${buttonClass('danger', 'sm')} list-none`}>
                              <PowerOff className="size-4" aria-hidden />
                              ปิดการใช้งาน
                            </summary>
                            <div className="absolute right-0 z-20 mt-2 w-80 rounded-card border border-ink-200 bg-surface p-4 shadow-lg">
                              <ActionForm action={disableKioskAction.bind(null, id, k.id)} className="flex flex-col gap-3">
                                <FormField label="เหตุผล (ลูกค้าเห็นในหน้า Admin)" name="reason" required>
                                  <Input id={`reason-${k.id}`} name="reason" required maxLength={255} placeholder="เช่น ค้างชำระค่าบริการ" />
                                </FormField>
                                <p className="text-xs text-ink-500">ที่ตู้จะแสดงเพียง “ตู้ปิดใช้งานชั่วคราว กรุณาติดต่อผู้ให้บริการ”</p>
                                <SubmitButton variant="danger" size="sm">
                                  ยืนยันปิดการใช้งาน
                                </SubmitButton>
                              </ActionForm>
                            </div>
                          </details>
                        ) : null}
                        {canManage && (k.status === 'active' || k.status === 'disabled') ? (
                          <ActionForm action={unpairKioskPlatformAction.bind(null, id, k.id)} confirm={`ยกเลิกการเชื่อมต่อ "${k.name}"? ต้องจับคู่ใหม่ก่อนใช้งานอีกครั้ง`}>
                            <SubmitButton variant="ghost" size="sm">
                              <Unlink className="size-4" aria-hidden />
                              ยกเลิกการเชื่อมต่อ
                            </SubmitButton>
                          </ActionForm>
                        ) : null}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        ) : (
          <div className="p-5">
            <EmptyState title="ลูกค้ายังไม่มีตู้" icon={<MonitorSmartphone aria-hidden />}>
              ลงทะเบียนตู้ด้านบน แล้วกรอกรหัสจับคู่ที่หน้า Config ของตู้
            </EmptyState>
          </div>
        )}
      </Card>
    </div>
  );
}
