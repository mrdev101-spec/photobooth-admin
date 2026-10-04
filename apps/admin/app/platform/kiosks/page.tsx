import type { Metadata } from 'next';
import Link from 'next/link';
import { Filter, MonitorSmartphone, Plus } from 'lucide-react';
import { requirePlatform } from '@/server/auth/context';
import { listAllKiosks } from '@/server/services/kiosks';
import { listOrganizations } from '@/server/services/organizations';
import { AutoRefresh } from '@/components/auto-refresh';
import { ConnectionBadge, modeName } from '@/components/kiosk-badges';
import { Badge, EmptyState, PageHeader, Select, Table, Td, Th, buttonClass } from '@/components/ui';
import { connectionOf, kioskIssues } from '@/lib/kiosk-status';
import { formatRelative } from '@/lib/format';

export const metadata: Metadata = { title: 'ตู้ทั้งหมด' };

export default async function PlatformKiosksPage({ searchParams }: { searchParams: Promise<{ org?: string }> }) {
  await requirePlatform();
  const { org: orgFilter } = await searchParams;
  const [orgs, rows] = await Promise.all([listOrganizations(), listAllKiosks({ orgId: orgFilter || undefined })]);
  const selected = orgs.find((o) => o.id === orgFilter);
  const now = Date.now();

  return (
    <>
      <AutoRefresh seconds={30} />
      <PageHeader
        title="ตู้ทั้งหมด"
        description={`${rows.length} ตู้${selected ? ` ของ ${selected.name}` : ' ทุกบัญชีลูกค้า'} • ตั้งค่า เปิด/ปิดการใช้งาน ได้ที่แท็บ “ตู้” ของลูกค้า`}
        actions={
          selected ? (
            <Link href={`/platform/organizations/${selected.id}/kiosks`} className={buttonClass()}>
              <Plus className="size-5" aria-hidden />
              ลงทะเบียนตู้ให้ {selected.name}
            </Link>
          ) : null
        }
      />

      <form action="/platform/kiosks" className="mb-4 flex flex-wrap items-center gap-2">
        <label htmlFor="org" className="text-sm font-medium text-ink-700">
          ลูกค้า
        </label>
        <Select id="org" name="org" defaultValue={orgFilter ?? ''} wrapperClassName="w-72" className="h-10">
          <option value="">ทุกบัญชีลูกค้า</option>
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </Select>
        <button type="submit" className={buttonClass('outline', 'sm', 'h-10')}>
          <Filter className="size-4" aria-hidden />
          กรอง
        </button>
        {!selected ? <span className="text-sm text-ink-500">เลือกลูกค้าเพื่อลงทะเบียนตู้ใหม่</span> : null}
      </form>

      {rows.length ? (
        <Table>
          <thead>
            <tr>
              <Th>ตู้</Th>
              <Th>ลูกค้า / สาขา</Th>
              <Th>สถานะ</Th>
              <Th>โหมด</Th>
              <Th>ต้องดูแล</Th>
              <Th>เวอร์ชัน</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ kiosk: k, orgId, orgName, branchName }) => {
              const issues = kioskIssues(k, now).filter((i) => i.level !== 'info');
              return (
                <tr key={k.id} className="align-top hover:bg-ink-50">
                  <Td>
                    <Link href={`/platform/organizations/${orgId}/kiosks`} className="font-semibold text-ink-900 hover:underline">
                      {k.name}
                    </Link>
                    <div className="font-mono text-xs text-ink-500">{k.kioskId ?? 'ยังไม่จับคู่'}</div>
                  </Td>
                  <Td>
                    <Link href={`/platform/organizations/${orgId}`} className="text-ink-900 hover:underline">
                      {orgName}
                    </Link>
                    <div className="text-xs text-ink-500">{branchName ?? '—'}</div>
                  </Td>
                  <Td>
                    <ConnectionBadge connection={connectionOf(k, now)} />
                    {k.status === 'active' ? <div className="mt-1 text-xs text-ink-500">{formatRelative(k.lastSeenAt, now)}</div> : null}
                  </Td>
                  <Td className="text-ink-600">{modeName(k.mode)}</Td>
                  <Td>
                    <div className="flex flex-col items-start gap-1">
                      {issues.length ? (
                        issues.map((i) => (
                          <Badge key={i.text} tone={i.level === 'danger' ? 'danger' : 'warning'} dot>
                            {i.text}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-ink-400">—</span>
                      )}
                    </div>
                  </Td>
                  <Td className="text-ink-600">{k.appVersion ?? '—'}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      ) : (
        <EmptyState title={selected ? `${selected.name} ยังไม่มีตู้` : 'ยังไม่มีตู้ในระบบ'} icon={<MonitorSmartphone aria-hidden />} />
      )}
    </>
  );
}
