import type { Metadata } from 'next';
import Link from 'next/link';
import { Building2, CircleCheck, CirclePause, MonitorSmartphone, Unplug, WifiOff, TriangleAlert } from 'lucide-react';
import { requirePlatform } from '@/server/auth/context';
import { flaggedOrdersByOrg } from '@/server/services/orders';
import { listOrganizations } from '@/server/services/organizations';
import { listAllKiosks } from '@/server/services/kiosks';
import { AutoRefresh } from '@/components/auto-refresh';
import { Badge, Card, EmptyState, Notice, PageHeader, StatCard, Table, Td, Th } from '@/components/ui';
import { connectionOf, kioskIssues } from '@/lib/kiosk-status';
import { formatNumber, formatRelative } from '@/lib/format';

export const metadata: Metadata = { title: 'ภาพรวมแพลตฟอร์ม' };

/** Platform dashboard: customers per status, fleet health across every customer, kiosks that need attention. */
export default async function PlatformOverviewPage() {
  const ctx = await requirePlatform();
  const [orgs, allKiosks, flagged] = await Promise.all([listOrganizations(), listAllKiosks(), flaggedOrdersByOrg(ctx, new Date(Date.now() - 30 * 86_400_000))]);
  const kiosks = allKiosks.filter((k) => k.kiosk.status !== 'revoked');
  const now = Date.now();

  const active = orgs.filter((o) => o.status === 'active').length;
  const suspended = orgs.length - active;
  let online = 0;
  let offline = 0;
  let pending = 0;
  const attention: { id: string; name: string; orgName: string; orgSlug: string; level: 'danger' | 'warn'; text: string; lastSeenAt: Date | null }[] = [];
  for (const { kiosk, orgName, orgSlug } of kiosks) {
    const c = connectionOf(kiosk, now);
    if (c === 'online') online++;
    else if (c === 'pending') pending++;
    else if (c !== 'revoked') offline++;
    const worst = kioskIssues(kiosk, now).find((i) => i.level !== 'info');
    if (worst) attention.push({ id: kiosk.id, name: kiosk.name, orgName, orgSlug, level: worst.level as 'danger' | 'warn', text: worst.text, lastSeenAt: kiosk.lastSeenAt });
  }
  attention.sort((a, b) => (a.level === b.level ? 0 : a.level === 'danger' ? -1 : 1));

  return (
    <>
      <AutoRefresh seconds={30} />
      <PageHeader title="ภาพรวมแพลตฟอร์ม" description="สถานะลูกค้าและตู้ทั้งหมดบนระบบ" />
      <div className="flex flex-col gap-5">
        {flagged.length ? (
          <Notice tone="danger" title="ออเดอร์ที่ต้องตรวจสอบ (30 วัน)">
            ตู้รับเงินจริงทั้งที่บัญชียังไม่ได้รับอนุญาต ตรวจสอบกับ Stripe แล้วเปิดสิทธิ์รับเงินจริงหรือแก้การตั้งค่าตู้:{' '}
            {flagged.map((f, i) => (
              <span key={f.orgId}>
                {i ? ', ' : ''}
                <Link href={`/o/${f.orgSlug}/orders?range=30d`} className="font-semibold underline">
                  {f.orgName}
                </Link>{' '}
                ({formatNumber(f.orders)} ออเดอร์, ล่าสุด {formatRelative(f.lastAt)})
              </span>
            ))}
          </Notice>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard tone="primary" label="ลูกค้าที่ใช้งานอยู่" value={formatNumber(active)} icon={<CircleCheck aria-hidden />} href="/platform/organizations" />
          <StatCard label="ลูกค้าที่ถูกระงับ" value={formatNumber(suspended)} icon={<CirclePause aria-hidden />} href="/platform/organizations" />
          <StatCard label="ตู้ออนไลน์" value={`${formatNumber(online)} / ${formatNumber(kiosks.length - pending)}`} icon={<MonitorSmartphone aria-hidden />} href="/platform/kiosks" />
          <StatCard tone={offline ? 'danger' : 'default'} label="ตู้ออฟไลน์ / ขาดการติดต่อ" value={formatNumber(offline)} icon={<WifiOff aria-hidden />} href="/platform/kiosks" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <StatCard label="บัญชีลูกค้าทั้งหมด" value={formatNumber(orgs.length)} icon={<Building2 aria-hidden />} />
          <StatCard label="ตู้รอจับคู่" value={formatNumber(pending)} icon={<Unplug aria-hidden />} />
        </div>

        <Card flush title="ตู้ที่ต้องดูแล" subtitle="ออฟไลน์ เครื่องพิมพ์หรือกล้องมีปัญหา ตู้ไม่รับการตั้งค่า เครื่องเปลี่ยน" icon={<TriangleAlert aria-hidden />}>
          {attention.length ? (
            <Table bare>
              <thead>
                <tr>
                  <Th>ตู้</Th>
                  <Th>ลูกค้า</Th>
                  <Th>ปัญหา</Th>
                  <Th className="text-right">ติดต่อล่าสุด</Th>
                </tr>
              </thead>
              <tbody>
                {attention.slice(0, 15).map((a) => (
                  <tr key={a.id} className="hover:bg-ink-50">
                    <Td>
                      <Link href={`/platform/kiosks/${a.id}`} className="font-semibold text-ink-900 hover:underline">
                        {a.name}
                      </Link>
                    </Td>
                    <Td className="text-ink-700">{a.orgName}</Td>
                    <Td>
                      <Badge tone={a.level === 'danger' ? 'danger' : 'warning'} dot>
                        {a.text}
                      </Badge>
                    </Td>
                    <Td className="text-right text-ink-600">{formatRelative(a.lastSeenAt, now)}</Td>
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
      </div>
    </>
  );
}
