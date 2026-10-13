import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight, MonitorSmartphone, Plus, Search } from 'lucide-react';
import { requirePlatform } from '@/server/auth/context';
import { listAllKiosks } from '@/server/services/kiosks';
import { AutoRefresh } from '@/components/auto-refresh';
import { ConnectionBadge, modeName } from '@/components/kiosk-badges';
import { Badge, EmptyState, Input, PageHeader, Table, Td, Th, buttonClass } from '@/components/ui';
import { connectionOf, kioskIssues } from '@/lib/kiosk-status';
import { formatRelative } from '@/lib/format';
import { KIOSK_TABS, STAGE_INFO, inTab, kioskStage, type KioskTab } from '@/lib/kiosk-lifecycle';

export const metadata: Metadata = { title: 'ตู้' };

/**
 * Every kiosk on the platform in one place, by where it is in its life (stock → shop → retired).
 * A row opens the kiosk's own Platform page; nothing here jumps into a shop's system.
 */
export default async function PlatformKiosksPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  await requirePlatform();
  const sp = await searchParams;
  const tab: KioskTab = KIOSK_TABS.some((t) => t.id === sp.tab) ? (sp.tab as KioskTab) : 'all';
  const q = (sp.q ?? '').trim().toLowerCase();
  const now = Date.now();
  const all = (await listAllKiosks()).map((r) => {
    const issues = kioskIssues(r.kiosk, now).filter((i) => i.level !== 'info');
    const stage = kioskStage(r.kiosk, r.orgKind === 'stock');
    return { ...r, issues, stage, attention: issues.some((i) => i.level === 'danger') };
  });
  const matches = (r: (typeof all)[number]) =>
    !q || [r.kiosk.name, r.kiosk.kioskId, r.kiosk.formerKioskId, r.kiosk.hostname, r.orgName, r.branchName].some((v) => v && v.toLowerCase().includes(q));
  const counts = Object.fromEntries(KIOSK_TABS.map((t) => [t.id, all.filter((r) => inTab(t.id, r.stage, r.attention) && matches(r)).length]));
  const rows = all.filter((r) => inTab(tab, r.stage, r.attention) && matches(r));
  const href = (t: string) => `/platform/kiosks?tab=${t}${q ? `&q=${encodeURIComponent(q)}` : ''}`;

  return (
    <>
      <AutoRefresh seconds={30} />
      <PageHeader
        title="ตู้"
        description="ตู้ทุกเครื่องบนแพลตฟอร์ม ทั้งในคลังและที่อยู่กับร้าน • กดที่ตู้เพื่อดูสถานะ ขั้นตอนถัดไป การตั้งค่า และประวัติ"
        actions={
          <Link href="/platform/kiosks/new" className={buttonClass()}>
            <Plus className="size-5" aria-hidden />
            เพิ่มตู้
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-ink-200">
        <nav aria-label="กลุ่มตู้" className="-mb-px flex gap-1 overflow-x-auto">
          {KIOSK_TABS.map((t) => (
            <Link
              key={t.id}
              href={href(t.id)}
              aria-current={tab === t.id ? 'page' : undefined}
              className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium ${tab === t.id ? 'border-primary-600 text-ink-900' : 'border-transparent text-ink-500 hover:text-ink-900'}`}
            >
              {t.label}
              <span className={`rounded-full px-2 py-0.5 text-xs ${t.id === 'attention' && counts[t.id] ? 'bg-red-100 text-red-700' : 'bg-ink-100 text-ink-600'}`}>{counts[t.id]}</span>
            </Link>
          ))}
        </nav>
        <form action="/platform/kiosks" className="mb-2 flex items-center gap-2">
          <input type="hidden" name="tab" value={tab} />
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" aria-hidden />
            <Input name="q" defaultValue={sp.q ?? ''} placeholder="ค้นหาชื่อตู้ Kiosk ID ร้าน สาขา" aria-label="ค้นหาตู้" className="h-10 w-72 pl-9" />
          </div>
        </form>
      </div>

      {rows.length ? (
        <Table>
          <thead>
            <tr>
              <Th>ตู้</Th>
              <Th>อยู่ที่</Th>
              <Th>ขั้นตอน</Th>
              <Th>การเชื่อมต่อ</Th>
              <Th>ต้องดูแล</Th>
              <Th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ kiosk: k, orgName, orgKind, branchName, issues, stage }) => {
              const info = STAGE_INFO[stage];
              return (
                <tr key={k.id} className="relative align-top hover:bg-ink-50">
                  <Td>
                    {/* the whole row opens the kiosk */}
                    <Link href={`/platform/kiosks/${k.id}`} className="font-semibold text-ink-900 after:absolute after:inset-0 hover:underline">
                      {k.name}
                    </Link>
                    <div className="font-mono text-xs text-ink-500">{k.kioskId ?? k.formerKioskId ?? 'ยังไม่เคยลงทะเบียน'}</div>
                  </Td>
                  <Td className="text-ink-700">
                    {orgKind === 'stock' ? (
                      <Badge tone="info">คลังตู้</Badge>
                    ) : (
                      <>
                        <div className="font-medium">{orgName}</div>
                        <div className="text-xs text-ink-500">{branchName ?? '—'}</div>
                      </>
                    )}
                  </Td>
                  <Td>
                    <Badge tone={info.tone} dot>
                      {info.label}
                    </Badge>
                    {k.mode && stage === 'shop_active' ? <div className="mt-1 text-xs text-ink-500">โหมด {modeName(k.mode)}</div> : null}
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
                    <div className="flex flex-col items-start gap-1">
                      {stage !== 'archived' && issues.length ? (
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
                  <Td className="text-ink-400">
                    <ChevronRight className="size-4" aria-hidden />
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      ) : (
        <EmptyState title={q ? 'ไม่พบตู้ที่ค้นหา' : tab === 'stock' ? 'ไม่มีตู้ในคลัง' : tab === 'archived' ? 'ยังไม่มีตู้ที่ยกเลิก' : 'ยังไม่มีตู้'} icon={<MonitorSmartphone aria-hidden />}>
          {tab === 'stock' || tab === 'all' ? 'กด "เพิ่มตู้" เพื่อเพิ่มตู้เข้าคลัง หรือเพิ่มให้ร้านโดยตรง' : null}
        </EmptyState>
      )}
    </>
  );
}
