import type { Metadata } from 'next';
import Link from 'next/link';
import { requireOrg } from '@/server/auth/context';
import { can } from '@/server/auth/rbac';
import { archivedKioskCount, canManageFleet, kioskQuotaUsage, listKiosks } from '@/server/services/kiosks';
import { formatQuota, isFull } from '@/lib/quota';
import { listBranches } from '@/server/services/branches';
import { AutoRefresh } from '@/components/auto-refresh';
import { ConnectionBadge, modeName } from '@/components/kiosk-badges';
import { Archive, Filter, MonitorSmartphone, Plus } from 'lucide-react';
import { Badge, EmptyState, PageHeader, Select, Table, Td, Th, buttonClass } from '@/components/ui';
import { connectionOf, kioskIssues, type Connection } from '@/lib/kiosk-status';
import { formatRelative } from '@/lib/format';

import { ModeSwitcher } from '@/components/mode-switcher';
import { modeSourceOf } from '@/server/services/quick-settings';
import { currentSettings } from '@/server/services/kiosk-config';
import { resolvePermissions } from '@/lib/config-permissions';
import { can as canDo } from '@/server/auth/rbac';
import { setKioskModeAction } from './actions';

export const metadata: Metadata = { title: 'ตู้' };

const FILTERS: { id: 'all' | 'attention' | Connection; label: string }[] = [
  { id: 'all', label: 'ทั้งหมด' },
  { id: 'attention', label: 'ต้องดูแล' },
  { id: 'online', label: 'ออนไลน์' },
  { id: 'offline', label: 'ออฟไลน์' },
  { id: 'pending', label: 'รอจับคู่' }
];

export default async function KiosksPage({
  params,
  searchParams
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ branch?: string; show?: string; revoked?: string }>;
}) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const ctx = await requireOrg(orgSlug, 'kiosk.view');
  const [rows, branches, quota, archivedCount] = await Promise.all([
    listKiosks(ctx, { branchId: sp.branch || undefined, includeRevoked: sp.revoked === '1' }),
    listBranches(ctx),
    kioskQuotaUsage(ctx),
    archivedKioskCount(ctx)
  ]);
  const now = Date.now();
  // The mode the Admin last sent each kiosk, and whether this user may switch it
  const modeSetting = new Map(await Promise.all(rows.filter((r) => r.kiosk.currentRevision > 0).map(async (r) => [r.kiosk.id, (await currentSettings(r.kiosk))?.settings.appMode ?? null] as const)));
  // Where each kiosk's mode comes from (its งาน / ค่ากลาง, or itself)
  const modeSource = new Map(await Promise.all(rows.filter((r) => r.kiosk.currentRevision > 0).map(async (r) => [r.kiosk.id, await modeSourceOf(ctx, r.kiosk)] as const)));
  const canMode = canDo(ctx.principal, 'config.edit') && (!!ctx.principal.platformRole || resolvePermissions(ctx.org.configPermissions).mode === 'edit');
  const show = FILTERS.some((f) => f.id === sp.show) ? sp.show! : 'all';

  const items = rows
    .map((r) => ({ ...r, connection: connectionOf(r.kiosk, now), issues: kioskIssues(r.kiosk, now) }))
    .filter((r) => {
      if (show === 'all') return true;
      if (show === 'attention') return r.issues.some((i) => i.level !== 'info');
      if (show === 'offline') return r.connection === 'offline' || r.connection === 'stale' || r.connection === 'never';
      return r.connection === show;
    });

  const base = `/o/${ctx.org.slug}/kiosks`;
  const qs = (patch: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const merged = { branch: sp.branch, show: show === 'all' ? undefined : show, revoked: sp.revoked, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) q.set(k, v);
    const s = q.toString();
    return s ? `${base}?${s}` : base;
  };
  const canManage = can(ctx.principal, 'kiosk.manage') && canManageFleet(ctx);

  return (
    <>
      <AutoRefresh seconds={15} />
      <PageHeader
        title="ตู้"
        description={`ใช้ ${formatQuota(quota.used, quota.quota)} ตู้ • อัปเดตสถานะอัตโนมัติ`}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            {/* Retired kiosks ("ยกเลิกตู้"), kept as history */}
            <Link href={`${base}/history`} className={buttonClass('secondary')}>
              <Archive className="size-5" aria-hidden />
              ประวัติตู้ที่ยกเลิก{archivedCount ? ` (${archivedCount})` : ''}
            </Link>
            {canManage ? (
              !isFull(quota.used, quota.quota) ? (
                <Link href={`${base}/new`} className={buttonClass()}>
                  <Plus className="size-5" aria-hidden />
                  เพิ่มตู้
                </Link>
              ) : (
                <span className="text-sm text-ink-500">ตู้ครบโควตาแล้ว</span>
              )
            ) : null}
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1 rounded-lg border border-ink-200 bg-surface p-1" role="tablist" aria-label="กรองตามสถานะ">
          {FILTERS.map((f) => (
            <Link
              key={f.id}
              href={qs({ show: f.id === 'all' ? undefined : f.id })}
              aria-current={show === f.id ? 'page' : undefined}
              className={
                show === f.id
                  ? 'rounded-md bg-ink-900 px-3 py-1.5 text-sm font-medium text-white'
                  : 'rounded-md px-3 py-1.5 text-sm font-medium text-ink-600 hover:bg-ink-100 hover:text-ink-900'
              }
            >
              {f.label}
            </Link>
          ))}
        </div>
        <form action={base} className="ml-auto flex items-center gap-2">
          {show !== 'all' ? <input type="hidden" name="show" value={show} /> : null}
          <label htmlFor="branch" className="sr-only">
            สาขา
          </label>
          <Select id="branch" name="branch" defaultValue={sp.branch ?? ''} wrapperClassName="w-52" className="h-10">
            <option value="">ทุกสาขา</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
          <label className="flex items-center gap-1.5 text-sm text-ink-600">
            <input type="checkbox" name="revoked" value="1" defaultChecked={sp.revoked === '1'} className="size-4" />
            รวมที่ยกเลิกแล้ว
          </label>
          <button type="submit" className={buttonClass('secondary', 'sm', 'h-10')}>
            <Filter className="size-4" aria-hidden />
            กรอง
          </button>
        </form>
      </div>

      {items.length ? (
        <Table>
          <thead>
            <tr>
              <Th>ตู้</Th>
              <Th>สถานะ</Th>
              <Th>สาขา</Th>
              <Th>โหมด</Th>
              <Th>ต้องดูแล</Th>
              <Th>เวอร์ชัน</Th>
            </tr>
          </thead>
          <tbody>
            {items.map(({ kiosk: k, branchName, connection, issues }) => (
              <tr key={k.id} className="align-top hover:bg-ink-50">
                <Td>
                  <Link href={`${base}/${k.id}`} className="font-semibold text-ink-900 hover:underline">
                    {k.name}
                  </Link>
                  <div className="font-mono text-xs text-ink-500">{k.kioskId ?? k.formerKioskId ?? '—'}</div>
                </Td>
                <Td>
                  <ConnectionBadge connection={connection} />
                  {k.status === 'active' ? <div className="mt-1 text-xs text-ink-500">{formatRelative(k.lastSeenAt, now)}</div> : null}
                </Td>
                <Td className="text-ink-600">{branchName ?? '—'}</Td>
                <Td className="text-ink-600">
                  {k.currentRevision > 0 && k.status !== 'revoked' ? (
                    <ModeSwitcher compact reported={k.mode} setting={modeSetting.get(k.id) ?? null} action={setKioskModeAction.bind(null, ctx.org.slug, k.id)} disabled={!canMode} source={modeSource.get(k.id)} />
                  ) : (
                    modeName(k.mode)
                  )}
                </Td>
                <Td>
                  <div className="flex flex-col items-start gap-1">
                    {issues.length ? (
                      issues.slice(0, 3).map((i) => (
                        <Badge key={i.text} tone={i.level === 'danger' ? 'danger' : i.level === 'warn' ? 'warning' : 'info'} dot>
                          {i.text}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-ink-500">—</span>
                    )}
                    {issues.length > 3 ? <span className="text-xs text-ink-500">และอีก {issues.length - 3}</span> : null}
                  </div>
                </Td>
                <Td className="text-ink-600">{k.appVersion ?? '—'}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : rows.length ? (
        <EmptyState title="ไม่มีตู้ที่ตรงกับตัวกรอง" />
      ) : (
        <EmptyState title="ยังไม่มีตู้" icon={<MonitorSmartphone aria-hidden />}>
          {canManage ? 'กด "เพิ่มตู้" แล้วใช้รหัสจับคู่ที่หน้าจอ Config ของตู้' : 'ผู้ให้บริการจะลงทะเบียนและติดตั้งตู้ให้ ตู้จะแสดงที่นี่เมื่อเชื่อมต่อแล้ว'}
        </EmptyState>
      )}
    </>
  );
}
