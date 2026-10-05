import { formatQuota } from '@/lib/quota';
import type { Metadata } from 'next';
import Link from 'next/link';
import { count, eq } from 'drizzle-orm';
import { Banknote, CircleCheck, Gauge, PackageCheck, ReceiptText, MonitorSmartphone, Sparkles, TriangleAlert, Unplug, WifiOff } from 'lucide-react';
import { requireOrg } from '@/server/auth/context';
import { can } from '@/server/auth/rbac';
import { db } from '@/server/db/client';
import { branches, memberships } from '@/server/db/schema';
import { orgWhere } from '@/server/tenancy/scoped';
import { listKiosks } from '@/server/services/kiosks';
import { pickupQueue, salesSummary, startOfThaiDay } from '@/server/services/orders';
import { orgAiUsage } from '@/server/services/ai-jobs';
import { AiUsageBar, aiUsageLevel } from '@/components/ai-usage';
import { AutoRefresh } from '@/components/auto-refresh';
import { Badge, Card, DetailRow, EmptyState, Notice, PageHeader, StatCard, Table, Td, Th } from '@/components/ui';
import { connectionOf, kioskIssues } from '@/lib/kiosk-status';
import { formatBaht, formatNumber, formatRelative } from '@/lib/format';

export const metadata: Metadata = { title: 'ภาพรวม' };

export default async function DashboardPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const ctx = await requireOrg(orgSlug);
  const canKiosks = can(ctx.principal, 'kiosk.view');
  const canSales = can(ctx.principal, 'report.view');
  const canPickup = can(ctx.principal, 'pickup.use');
  const todayStart = startOfThaiDay();
  const [branchCount, memberCount, kioskRows, today, queue, ai] = await Promise.all([
    db().select({ n: count() }).from(branches).where(orgWhere(ctx, branches.orgId, eq(branches.isActive, true))),
    db().select({ n: count() }).from(memberships).where(orgWhere(ctx, memberships.orgId)),
    canKiosks ? listKiosks(ctx) : Promise.resolve([]),
    canSales ? salesSummary(ctx, todayStart, new Date(todayStart.getTime() + 86_400_000)) : Promise.resolve(null),
    canPickup ? pickupQueue(ctx) : Promise.resolve(null),
    orgAiUsage(ctx.org)
  ]);
  const aiLevel = aiUsageLevel(ai.used, ai.quota);
  const waiting = queue ? queue.waiting.filter((o) => o.status === 'uploaded').length : 0;
  const base = `/o/${ctx.org.slug}`;
  const now = Date.now();

  const fleet = { online: 0, stale: 0, offline: 0, pending: 0 };
  const attention: { id: string; name: string; level: 'danger' | 'warn'; text: string; lastSeenAt: Date | null }[] = [];
  for (const { kiosk } of kioskRows) {
    const c = connectionOf(kiosk, now);
    if (c === 'online') fleet.online++;
    else if (c === 'stale') fleet.stale++;
    else if (c === 'pending') fleet.pending++;
    else if (c === 'offline' || c === 'never') fleet.offline++;
    for (const issue of kioskIssues(kiosk, now)) {
      if (issue.level !== 'info') attention.push({ id: kiosk.id, name: kiosk.name, level: issue.level, text: issue.text, lastSeenAt: kiosk.lastSeenAt });
    }
  }
  attention.sort((a, b) => (a.level === b.level ? 0 : a.level === 'danger' ? -1 : 1));
  const paired = kioskRows.length - fleet.pending;

  return (
    <>
      {canKiosks ? <AutoRefresh seconds={30} /> : null}
      <PageHeader title="ภาพรวม" description={`สถานะตู้ทั้งหมดของ ${ctx.org.name}`} />
      {aiLevel !== 'ok' ? (
        <Notice tone={aiLevel === 'full' ? 'danger' : 'warn'} title={aiLevel === 'full' ? 'ภาพ AI ครบโควตาเดือนนี้แล้ว' : 'ภาพ AI ใกล้ครบโควตาเดือนนี้'}>
          ใช้ไป {formatNumber(ai.used)} จาก {formatNumber(ai.quota ?? 0)} ภาพ
          {aiLevel === 'full' ? ' • โหมด AI ของตู้ปิดให้บริการชั่วคราวจนถึงเดือนถัดไป' : ' • ครบแล้วโหมด AI ของตู้จะปิดให้บริการชั่วคราว'} ติดต่อผู้ให้บริการเพื่อเพิ่มโควตา
        </Notice>
      ) : null}
      <div className="flex flex-col gap-5">
        {!ctx.org.livePaymentsAllowed ? (
          <Notice tone="warn" title="ยังรับเงินจริงไม่ได้">
            บัญชีนี้ยังไม่ได้รับอนุญาตให้รับเงินจริง ตู้จะรับได้แค่โหมดทดสอบ ติดต่อผู้ดูแลแพลตฟอร์มเมื่อพร้อมขาย
          </Notice>
        ) : null}

        {today || queue ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {today ? (
              <>
                <StatCard tone="primary" label="ยอดขายวันนี้ (เงินจริง)" value={formatBaht(today.total.liveSatang / 100)} icon={<Banknote aria-hidden />} href={`${base}/sales?range=today`} />
                <StatCard label="ออเดอร์วันนี้" value={formatNumber(today.total.orders)} icon={<ReceiptText aria-hidden />} href={`${base}/orders?range=today`} />
              </>
            ) : null}
            {queue ? (
              <StatCard tone={waiting ? 'danger' : 'default'} label="รอรับรูปที่จุดรับ" value={formatNumber(waiting)} icon={<PackageCheck aria-hidden />} href={`${base}/pickup`} />
            ) : null}
          </div>
        ) : null}

        {canKiosks ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard tone="primary" label="ตู้ออนไลน์" value={`${formatNumber(fleet.online)} / ${formatNumber(paired)}`} icon={<MonitorSmartphone aria-hidden />} href={`${base}/kiosks?show=online`} />
            <StatCard tone={fleet.offline ? 'danger' : 'default'} label="ออฟไลน์ / ขาดการติดต่อ" value={formatNumber(fleet.offline + fleet.stale)} icon={<WifiOff aria-hidden />} href={`${base}/kiosks?show=offline`} />
            <StatCard label="รอจับคู่" value={formatNumber(fleet.pending)} icon={<Unplug aria-hidden />} href={`${base}/kiosks?show=pending`} />
            <StatCard label="ตู้ / โควตา" value={formatQuota(kioskRows.length, ctx.org.kioskQuota)} icon={<Gauge aria-hidden />} />
          </div>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-3">
          {canKiosks ? (
            <Card flush className="lg:col-span-2" title="ตู้ที่ต้องดูแล" subtitle="ออฟไลน์ อุปกรณ์มีปัญหา หรือไม่รับการตั้งค่า" icon={<TriangleAlert aria-hidden />}>
              {attention.length ? (
                <Table bare>
                  <thead>
                    <tr>
                      <Th>ตู้</Th>
                      <Th>ปัญหา</Th>
                      <Th className="text-right">ติดต่อล่าสุด</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {attention.slice(0, 12).map((a, i) => (
                      <tr key={`${a.id}-${i}`} className="hover:bg-ink-50">
                        <Td>
                          <Link href={`${base}/kiosks/${a.id}`} className="font-semibold text-ink-900 hover:underline">
                            {a.name}
                          </Link>
                        </Td>
                        <Td>
                          <Badge tone={a.level === 'danger' ? 'danger' : 'warning'} dot>
                            {a.text}
                          </Badge>
                        </Td>
                        <Td className="text-right whitespace-nowrap text-ink-600">{formatRelative(a.lastSeenAt, now)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              ) : (
                <div className="p-5">
                  <EmptyState title="ทุกตู้ทำงานปกติ" icon={<CircleCheck aria-hidden />} />
                </div>
              )}
            </Card>
          ) : null}

          <Card title="บัญชี" subtitle="ข้อมูลและโควตาจากแพลตฟอร์ม" icon={<Sparkles aria-hidden />}>
            <dl className="divide-y divide-ink-100">
              <DetailRow label="สาขาที่ใช้งาน">{formatNumber(branchCount[0]?.n ?? 0)}</DetailRow>
              <DetailRow label="ผู้ใช้ / โควตา">{formatQuota(memberCount[0]?.n ?? 0, ctx.org.userQuota)} คน</DetailRow>
              <DetailRow label="ภาพ AI เดือนนี้">
                <AiUsageBar used={ai.used} quota={ai.quota} className="w-full" />
              </DetailRow>
              <DetailRow label="รับเงินจริง">{ctx.org.livePaymentsAllowed ? <Badge tone="success" dot>อนุญาต</Badge> : <Badge dot>ยังไม่อนุญาต</Badge>}</DetailRow>
            </dl>
          </Card>
        </div>
      </div>
    </>
  );
}
