import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight, MonitorSmartphone, PackagePlus, Plus } from 'lucide-react';
import { orgContextForPlatform, requirePlatform } from '@/server/auth/context';
import { canPlatform } from '@/server/auth/rbac';
import { kioskQuotaUsage, listKiosks } from '@/server/services/kiosks';
import { AutoRefresh } from '@/components/auto-refresh';
import { ConnectionBadge } from '@/components/kiosk-badges';
import { Badge, Card, EmptyState, Notice, Table, Td, Th, buttonClass } from '@/components/ui';
import { connectionOf, kioskIssues } from '@/lib/kiosk-status';
import { formatRelative } from '@/lib/format';
import { formatQuota, isFull } from '@/lib/quota';
import { STAGE_INFO, kioskStage } from '@/lib/kiosk-lifecycle';

export const metadata: Metadata = { title: 'ตู้ของลูกค้า' };

/**
 * A shop's kiosks in the Platform: a list only — each kiosk is managed on its own Platform page
 * (key, hand over, reset, disable, settings), the same page as from the "ตู้" menu.
 */
export default async function OrganizationKiosksPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const platform = await requirePlatform();
  const ctx = await orgContextForPlatform(platform, id);
  const canManage = canPlatform(platform.user.platformRole, 'platform.org.manage');
  const [rows, quota] = await Promise.all([listKiosks(ctx, { includeRevoked: true, includeArchived: true }), kioskQuotaUsage(ctx)]);
  const full = isFull(quota.used, quota.quota);
  const now = Date.now();

  return (
    <div className="flex flex-col gap-5">
      <AutoRefresh seconds={20} />
      <Card
        flush
        title={`ตู้ของ ${ctx.org.name}`}
        subtitle={`ใช้ ${formatQuota(quota.used, quota.quota)} ตู้ (ไม่นับตู้ที่ยกเลิกแล้ว) • กดที่ตู้เพื่อจัดการ`}
        icon={<MonitorSmartphone aria-hidden />}
        actions={
          canManage ? (
            <div className="flex flex-wrap gap-2">
              <Link href="/platform/kiosks?tab=stock" className={buttonClass('outline', 'sm')}>
                <PackagePlus className="size-4" aria-hidden />
                มอบตู้จากคลัง
              </Link>
              {!full ? (
                <Link href={`/platform/kiosks/new?org=${ctx.org.id}`} className={buttonClass('primary', 'sm')}>
                  <Plus className="size-4" aria-hidden />
                  เพิ่มตู้ใหม่ให้ร้านนี้
                </Link>
              ) : null}
            </div>
          ) : null
        }
      >
        {full && canManage ? (
          <div className="px-5 pt-4">
            <Notice tone="warn">ร้านมีตู้ครบโควตาแล้ว เพิ่มโควตาได้ที่แท็บ “ขีดจำกัดและสิทธิ์”</Notice>
          </div>
        ) : null}
        {rows.length ? (
          <Table bare>
            <thead>
              <tr>
                <Th>ตู้</Th>
                <Th>สาขา</Th>
                <Th>ขั้นตอน</Th>
                <Th>การเชื่อมต่อ</Th>
                <Th>ต้องดูแล</Th>
                <Th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ kiosk: k, branchName }) => {
                const stage = kioskStage(k, false);
                const info = STAGE_INFO[stage];
                const issues = kioskIssues(k, now).filter((i) => i.level !== 'info');
                return (
                  <tr key={k.id} className="relative align-top hover:bg-ink-50">
                    <Td>
                      <Link href={`/platform/kiosks/${k.id}`} className="font-semibold text-ink-900 after:absolute after:inset-0 hover:underline">
                        {k.name}
                      </Link>
                      <div className="font-mono text-xs text-ink-500">{k.kioskId ?? k.formerKioskId ?? 'ยังไม่เคยลงทะเบียน'}</div>
                    </Td>
                    <Td className="text-ink-600">{branchName ?? '—'}</Td>
                    <Td>
                      <Badge tone={info.tone} dot>
                        {info.label}
                      </Badge>
                    </Td>
                    <Td>
                      {stage === 'archived' ? (
                        <span className="text-ink-400">—</span>
                      ) : (
                        <>
                          <ConnectionBadge connection={connectionOf(k, now)} />
                          {k.lastSeenAt ? <div className="mt-1 text-xs text-ink-500">{formatRelative(k.lastSeenAt, now)}</div> : null}
                        </>
                      )}
                    </Td>
                    <Td>
                      {stage !== 'archived' && issues.length ? (
                        <Badge tone={issues[0]!.level === 'danger' ? 'danger' : 'warning'} dot>
                          {issues[0]!.text}
                        </Badge>
                      ) : (
                        <span className="text-ink-400">—</span>
                      )}
                    </Td>
                    <Td className="text-ink-400">
                      <ChevronRight className="size-4" aria-hidden />
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        ) : (
          <div className="p-5">
            <EmptyState title="ร้านนี้ยังไม่มีตู้" icon={<MonitorSmartphone aria-hidden />}>
              มอบตู้จากคลัง หรือเพิ่มตู้ใหม่ให้ร้านนี้ แล้วส่ง Key ให้ร้านลงทะเบียนที่ตู้
            </EmptyState>
          </div>
        )}
      </Card>
    </div>
  );
}
