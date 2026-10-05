import type { Metadata } from 'next';
import Link from 'next/link';
import { Archive, KeyRound, MonitorSmartphone, PackagePlus, Plus, Power, PowerOff, Settings2, Unlink } from 'lucide-react';
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
import { addFromStockAction, disableKioskAction, enableKioskAction, registerKioskAction, returnToStockAction, unpairKioskPlatformAction } from '../actions';
import { listStockKiosks } from '@/server/services/kiosk-stock';

export const metadata: Metadata = { title: 'ตู้ของลูกค้า' };

export default async function OrganizationKiosksPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pair?: string; new?: string; revoked?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const platform = await requirePlatform();
  const ctx = await orgContextForPlatform(platform, id);
  const canManage = canPlatform(platform.user.platformRole, 'platform.org.manage');
  const isStock = ctx.org.kind === 'stock';
  // Locked kiosks (reset, waiting for a key) stay in the list
  const [rows, branches, quota, stock] = await Promise.all([listKiosks(ctx, { includeRevoked: true }), listBranches(ctx), kioskQuotaUsage(ctx), isStock ? Promise.resolve([]) : listStockKiosks()]);
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
          <p className="mb-2 font-semibold text-ink-900">Key ลงทะเบียนสำหรับ {pairing.kiosk.name}</p>
          <PairingPanel orgSlug={ctx.org.slug} kioskRowId={pairing.kiosk.id} autoStart={sp.new === '1'} kind="key" />
        </div>
      ) : null}

      {canManage && !isStock ? (
        <Card title="เพิ่มตู้จากคลัง" subtitle="ตู้ที่ยังไม่มีร้าน (ต้องรีเซ็ตและล็อกหลังทดสอบแล้ว) • มอบแล้วได้ Key สำหรับให้ลูกค้าลงทะเบียนที่ตู้" icon={<PackagePlus aria-hidden />}>
          {full ? (
            <Notice tone="warn">ลูกค้ามีตู้ครบโควตาแล้ว เพิ่มโควตาได้ที่แท็บ “ขีดจำกัดและสิทธิ์”</Notice>
          ) : !stock.length ? (
            <Notice tone="info">ไม่มีตู้ในคลัง • เพิ่มได้ที่เมนู “คลังตู้”</Notice>
          ) : !activeBranches.length ? (
            <Notice tone="warn">ลูกค้ายังไม่มีสาขาที่ใช้งาน</Notice>
          ) : (
            <ActionForm action={addFromStockAction.bind(null, id)} className="grid gap-4 sm:grid-cols-[1.4fr_1fr_auto] sm:items-end">
              <FormField label="ตู้ในคลัง" name="kioskRowId" required>
                <Select id="kioskRowId" name="kioskRowId" required defaultValue={stock.find((s) => s.movable)?.kiosk.id ?? ''}>
                  {stock.map(({ kiosk: s, movable }) => (
                    <option key={s.id} value={s.id} disabled={!movable}>
                      {s.name} • {s.kioskId ?? s.formerKioskId ?? 'ยังไม่เคยลงทะเบียน'}
                      {movable ? '' : ' (ลงทะเบียนอยู่ ต้องรีเซ็ตก่อน)'}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="สาขา" name="branchId" required>
                <Select id="stockBranchId" name="branchId" required defaultValue={activeBranches[0]!.id}>
                  {activeBranches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </FormField>
              <SubmitButton>มอบให้ลูกค้าและออก Key</SubmitButton>
            </ActionForm>
          )}
        </Card>
      ) : null}

      {canManage ? (
        <Card
          title={isStock ? 'เพิ่มตู้เข้าคลัง' : 'ลงทะเบียนตู้ใหม่ให้ลูกค้า'}
          subtitle={isStock ? 'ยังไม่ต้องมีร้าน • ได้ Key สำหรับช่างทดสอบ แล้วรีเซ็ตและล็อกก่อนมอบให้ร้าน' : `ใช้ ${formatQuota(quota.used, quota.quota)} ตู้ • หลังลงทะเบียนจะได้ Key สำหรับกรอกที่ตู้`}
          icon={<Plus aria-hidden />}
        >
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
              <SubmitButton>{isStock ? 'เพิ่มเข้าคลังและออก Key' : 'ลงทะเบียนและออก Key'}</SubmitButton>
            </ActionForm>
          )}
        </Card>
      ) : null}

      <Card
        flush
        title={isStock ? 'ตู้ในคลัง' : 'ตู้ทั้งหมดของลูกค้า'}
        subtitle="ปิดการใช้งาน: ตู้หยุดรับลูกค้าและรับเงิน เปิดกลับได้ทันที • รีเซ็ตและล็อก: ตู้ล็อกจนกว่าจะใส่ Key ใหม่ (ก่อนย้ายร้านหรือคืนคลัง)"
        icon={<MonitorSmartphone aria-hidden />}
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
                            ออก Key
                          </Link>
                        ) : null}
                        {canManage && !isStock && (k.status === 'pending' || k.status === 'revoked') ? (
                          <ActionForm action={returnToStockAction.bind(null, id, k.id)} confirm={`คืน "${k.name}" เข้าคลัง? Key ที่ออกไว้จะใช้ไม่ได้`}>
                            <SubmitButton variant="ghost" size="sm">
                              <Archive className="size-4" aria-hidden />
                              คืนเข้าคลัง
                            </SubmitButton>
                          </ActionForm>
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
                          <ActionForm
                            action={unpairKioskPlatformAction.bind(null, id, k.id)}
                            confirm={`รีเซ็ตและล็อก "${k.name}"? ตู้ล้างการตั้งค่าจาก Admin และล็อกทั้งระบบจนกว่าจะใส่ Key ใหม่`}
                          >
                            <SubmitButton variant="ghost" size="sm">
                              <Unlink className="size-4" aria-hidden />
                              รีเซ็ตและล็อกตู้
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
              {isStock ? 'เพิ่มตู้เข้าคลังด้านบน' : 'เพิ่มตู้จากคลัง หรือลงทะเบียนตู้ใหม่ด้านบน แล้วให้ลูกค้าใส่ Key ที่ตู้'}
            </EmptyState>
          </div>
        )}
      </Card>
    </div>
  );
}
