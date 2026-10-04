import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { requireOrg } from '@/server/auth/context';
import { can } from '@/server/auth/rbac';
import { canManageFleet, getKiosk } from '@/server/services/kiosks';
import { listBranches } from '@/server/services/branches';
import { AppError } from '@/server/lib/errors';
import { AutoRefresh } from '@/components/auto-refresh';
import { ActionForm, FormField, SubmitButton } from '@/components/form';
import { ConnectionBadge, modeName } from '@/components/kiosk-badges';
import { Activity, ChevronLeft, Cpu, Pencil, Printer, SlidersHorizontal, Wrench } from 'lucide-react';
import { Badge, Card, Input, Notice, PageHeader, Select } from '@/components/ui';
import { connectionOf, kioskIssues } from '@/lib/kiosk-status';
import { formatDateTime, formatRelative } from '@/lib/format';
import { acceptFingerprintAction, deleteKioskAction, setMaintenanceAction, unpairKioskAction, updateKioskAction } from '../actions';
import { PairingPanel } from './pairing-panel';
import { KioskTabs } from './kiosk-tabs';

export const metadata: Metadata = { title: 'ตู้' };

const PRINTER_ROLE: Record<string, string> = { main: 'หลัก / ใบรับรูป', photo: 'ภาพ 4x6', badge: 'เข็มกลัด' };

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-3 border-b border-ink-100 py-2 last:border-0">
      <dt className="text-ink-500">{label}</dt>
      <dd className="min-w-0 break-words text-ink-900">{children}</dd>
    </div>
  );
}

export default async function KioskPage({ params, searchParams }: { params: Promise<{ orgSlug: string; id: string }>; searchParams: Promise<{ pair?: string }> }) {
  const { orgSlug, id } = await params;
  const { pair } = await searchParams;
  const ctx = await requireOrg(orgSlug, 'kiosk.view');
  const { kiosk: k, branchName } = await getKiosk(ctx, id).catch((err) => {
    if (err instanceof AppError && err.code === 'not_found') notFound();
    throw err;
  });
  const now = Date.now();
  const connection = connectionOf(k, now);
  const issues = kioskIssues(k, now);
  const canManage = can(ctx.principal, 'kiosk.manage', { branchId: k.branchId });
  const canCommand = can(ctx.principal, 'kiosk.command', { branchId: k.branchId });
  // Pair / unpair / accept a new machine / delete: platform team, or customers the platform allowed (D12)
  const canFleet = canManage && canManageFleet(ctx);
  const branches = canManage ? (await listBranches(ctx)).filter((b) => b.isActive || b.id === k.branchId) : [];
  const base = `/o/${ctx.org.slug}/kiosks`;

  return (
    <>
      {k.status === 'active' ? <AutoRefresh seconds={20} /> : null}
      <PageHeader
        breadcrumb={
          <Link href={base} className="inline-flex items-center gap-1 hover:text-ink-900">
            <ChevronLeft className="size-4" aria-hidden />
            ตู้ทั้งหมด
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            {k.name}
            <ConnectionBadge connection={connection} />
          </span>
        }
        description={`${k.kioskId ?? k.formerKioskId ?? 'ยังไม่จับคู่'} · ${branchName ?? 'ไม่มีสาขา'}`}
      />
      <KioskTabs base={`${base}/${k.id}`} active="overview" paired={k.currentRevision > 0} />

      <div className="flex flex-col gap-6">
        {(k.status === 'pending' || k.status === 'revoked') && canFleet ? <PairingPanel orgSlug={ctx.org.slug} kioskRowId={k.id} autoStart={pair === '1' && k.status === 'pending'} /> : null}

        {k.status === 'disabled' ? (
          <Notice tone="danger" title="ตู้นี้ถูกปิดใช้งานโดยผู้ให้บริการ">
            {k.disabledReason ? <>เหตุผล: {k.disabledReason} • </> : null}ตู้ไม่รับลูกค้าใหม่และไม่รับเงิน ติดต่อผู้ให้บริการเพื่อเปิดใช้งานอีกครั้ง
          </Notice>
        ) : null}

        {(k.status === 'pending' || k.status === 'revoked') && !canFleet ? (
          <Notice tone="info">ผู้ให้บริการจะจับคู่และติดตั้งตู้นี้ให้ ตู้จะแสดงสถานะเมื่อเชื่อมต่อแล้ว</Notice>
        ) : null}

        {k.fingerprintMismatch ? (
          <Notice tone="danger">
            <p className="font-semibold">เครื่องที่ใช้ตู้นี้เปลี่ยนไป</p>
            <p className="mt-1">
              fingerprint ที่ตู้ส่งมา ({k.reportedFingerprint}) ไม่ตรงกับตอนจับคู่ ({k.fingerprint}) อาจมีการเปลี่ยนคอมพิวเตอร์ของตู้ หรือมีการคัดลอกโฟลเดอร์ข้อมูลของตู้ไปใช้เครื่องอื่น
            </p>
            {!canFleet ? <p className="mt-2 font-medium">แจ้งผู้ให้บริการเพื่อตรวจสอบ</p> : null}
            {canFleet ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <ActionForm action={acceptFingerprintAction.bind(null, orgSlug, k.id)} confirm="ยืนยันว่าเปลี่ยนเครื่องจริง?">
                  <SubmitButton size="sm">ยอมรับเครื่องใหม่</SubmitButton>
                </ActionForm>
                <ActionForm action={unpairKioskAction.bind(null, orgSlug, k.id)} confirm="ยกเลิกการเชื่อมต่อตู้นี้? ตู้จะใช้ Web Admin ไม่ได้จนกว่าจะจับคู่ใหม่">
                  <SubmitButton size="sm" variant="danger">
                    ยกเลิกการเชื่อมต่อ
                  </SubmitButton>
                </ActionForm>
              </div>
            ) : null}
          </Notice>
        ) : null}

        {issues.length && !k.fingerprintMismatch ? (
          <div className="flex flex-wrap gap-2">
            {issues.map((i) => (
              <Badge key={i.text} tone={i.level === 'danger' ? 'danger' : i.level === 'warn' ? 'warning' : 'info'} dot>
                {i.text}
              </Badge>
            ))}
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="สถานะ" subtitle="จาก heartbeat ล่าสุด (ทุก 60 วินาที)" icon={<Activity aria-hidden />}>
            <dl>
              <Row label="ติดต่อล่าสุด">{k.lastSeenAt ? `${formatRelative(k.lastSeenAt, now)} (${formatDateTime(k.lastSeenAt)})` : '—'}</Row>
              <Row label="โหมด">{modeName(k.mode)}</Row>
              <Row label="หน้าจอปัจจุบัน">{k.screen || '—'}</Row>
              <Row label="การตั้งค่า">
                {k.status === 'active' ? (
                  <>
                    ใช้ revision {k.appliedRevision ?? '—'} / ล่าสุด {k.currentRevision}
                  </>
                ) : (
                  '—'
                )}
              </Row>
              <Row label="ข้อมูลค้างส่ง">{k.queueDepth} รายการ</Row>
              <Row label="ปิดปรับปรุง">{k.maintenance ? <Badge tone="warn">เปิดอยู่</Badge> : 'ไม่'}</Row>
            </dl>
          </Card>

          <Card title="อุปกรณ์" subtitle="เครื่องพิมพ์และกล้องที่ตู้รายงาน" icon={<Printer aria-hidden />}>
            {k.printerState?.length || k.cameraState ? (
              <ul className="flex flex-col divide-y divide-ink-100">
                {(k.printerState ?? []).map((p) => (
                  <li key={p.role} className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                    <span>
                      <span className="text-sm text-ink-500">เครื่องพิมพ์{PRINTER_ROLE[p.role] ?? p.role}</span>
                      <br />
                      {p.name || '—'}
                      {p.error ? <span className="block text-danger-600">{p.error}</span> : null}
                    </span>
                    {p.ok ? <Badge tone="success" dot>พร้อม</Badge> : <Badge tone="danger" dot>มีปัญหา</Badge>}
                  </li>
                ))}
                {k.cameraState ? (
                  <li className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                    <span>
                      <span className="text-sm text-ink-500">กล้อง</span>
                      <br />
                      {k.cameraState.source === 'digicam' ? 'DSLR (digiCamControl)' : 'Webcam'}
                      {k.cameraState.error ? <span className="block text-danger-600">{k.cameraState.error}</span> : null}
                    </span>
                    {k.cameraState.ok ? <Badge tone="success" dot>พร้อม</Badge> : <Badge tone="danger" dot>มีปัญหา</Badge>}
                  </li>
                ) : null}
              </ul>
            ) : (
              <p className="text-ink-500">ตู้ยังไม่ได้รายงานอุปกรณ์</p>
            )}
          </Card>

          <Card title="ข้อมูลเครื่อง" icon={<Cpu aria-hidden />}>
            <dl>
              <Row label="Kiosk ID">
                <span className="font-mono">{k.kioskId ?? (k.formerKioskId ? `${k.formerKioskId} (เดิม)` : '—')}</span>
              </Row>
              <Row label="Fingerprint">
                <span className="font-mono">{k.fingerprint ?? '—'}</span>
              </Row>
              <Row label="ชื่อเครื่อง">{k.hostname ?? '—'}</Row>
              <Row label="IP">{k.ip ?? '—'}</Row>
              <Row label="เวอร์ชันโปรแกรม">{k.appVersion ?? '—'}</Row>
              <Row label="จับคู่เมื่อ">{formatDateTime(k.pairedAt)}</Row>
              {k.revokedAt ? <Row label="ยกเลิกเมื่อ">{formatDateTime(k.revokedAt)}</Row> : null}
            </dl>
          </Card>

          <Card title="ชื่อและสาขา" icon={<Pencil aria-hidden />}>
            {canManage ? (
              <ActionForm action={updateKioskAction.bind(null, orgSlug, k.id)} className="flex flex-col gap-4">
                <FormField label="ชื่อตู้" name="name">
                  <Input id="name" name="name" defaultValue={k.name} required maxLength={100} />
                </FormField>
                <FormField label="สาขา" name="branchId">
                  <Select id="branchId" name="branchId" defaultValue={k.branchId ?? ''} required>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <div>
                  <SubmitButton variant="secondary">บันทึก</SubmitButton>
                </div>
              </ActionForm>
            ) : (
              <dl>
                <Row label="สาขา">{branchName ?? '—'}</Row>
              </dl>
            )}
          </Card>
        </div>

        {k.localSettings ? (
          <Card title="ค่าฝั่งตู้" subtitle="ตั้งที่ตู้ ผูกกับเครื่องจริง (อ่านอย่างเดียว)" icon={<SlidersHorizontal aria-hidden />}>
            <dl className="grid gap-x-8 sm:grid-cols-2">
              {Object.entries(k.localSettings).map(([key, value]) => (
                <Row key={key} label={key}>
                  <span className="font-mono text-xs">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>
                </Row>
              ))}
            </dl>
          </Card>
        ) : null}

        {(canCommand && k.status === 'active') || canFleet ? (
          <Card title="การจัดการ" icon={<Wrench aria-hidden />}>
            <div className="flex flex-wrap gap-3">
              {canCommand && k.status === 'active' ? (
                <ActionForm
                  action={setMaintenanceAction.bind(null, orgSlug, k.id, !k.maintenance)}
                  confirm={k.maintenance ? undefined : 'ปิดปรับปรุงตู้นี้? ตู้จะไม่รับลูกค้าใหม่เมื่อกลับถึงหน้าแรก'}
                >
                  <SubmitButton variant="secondary">{k.maintenance ? 'เปิดรับลูกค้า' : 'ปิดปรับปรุงชั่วคราว'}</SubmitButton>
                </ActionForm>
              ) : null}
              {canFleet && (k.status === 'active' || k.status === 'disabled') && !k.fingerprintMismatch ? (
                <ActionForm action={unpairKioskAction.bind(null, orgSlug, k.id)} confirm="ยกเลิกการเชื่อมต่อตู้นี้? ตู้จะกลับไปใช้ค่าในเครื่อง และต้องจับคู่ใหม่เพื่อใช้ Web Admin">
                  <SubmitButton variant="danger">ยกเลิกการเชื่อมต่อ</SubmitButton>
                </ActionForm>
              ) : null}
              {canFleet && k.status === 'pending' && !k.pairedAt ? (
                <ActionForm action={deleteKioskAction.bind(null, orgSlug, k.id)} confirm={`ลบตู้ "${k.name}"?`}>
                  <SubmitButton variant="danger">ลบตู้</SubmitButton>
                </ActionForm>
              ) : null}
            </div>
          </Card>
        ) : null}
      </div>
    </>
  );
}
