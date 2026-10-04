import type { Metadata } from 'next';
import { Banknote, CircleCheck, Gauge, MonitorSmartphone, Pencil, Sparkles, Users } from 'lucide-react';
import { orgContextForPlatform, requirePlatform } from '@/server/auth/context';
import { canPlatform } from '@/server/auth/rbac';
import { listAllKiosks } from '@/server/services/kiosks';
import { memberUsage } from '@/server/services/members';
import { ActionForm, FormField, SubmitButton } from '@/components/form';
import { Badge, Card, Input, StatCard } from '@/components/ui';
import { connectionOf } from '@/lib/kiosk-status';
import { formatQuota } from '@/lib/quota';
import { setLivePaymentsAction, setOrganizationStatusAction, updateOrganizationAction } from '../actions';

export const metadata: Metadata = { title: 'ลูกค้า' };

export default async function OrganizationOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const platform = await requirePlatform();
  const ctx = await orgContextForPlatform(platform, id);
  const org = ctx.org;
  const canManage = canPlatform(platform.user.platformRole, 'platform.org.manage');
  const [kiosks, users] = await Promise.all([listAllKiosks({ orgId: org.id }), memberUsage(ctx)]);
  const now = Date.now();
  const online = kiosks.filter((k) => connectionOf(k.kiosk, now) === 'online').length;
  const disabled = kiosks.filter((k) => k.kiosk.status === 'disabled').length;
  const paired = kiosks.filter((k) => k.kiosk.status !== 'pending').length;
  const base = `/platform/organizations/${org.id}`;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard tone="primary" label="ตู้ / โควตา" value={formatQuota(kiosks.length, org.kioskQuota)} icon={<Gauge aria-hidden />} href={`${base}/kiosks`} />
        <StatCard label="ตู้ออนไลน์" value={`${online} / ${paired}`} hint={disabled ? `ปิดใช้งาน ${disabled} ตู้` : undefined} icon={<MonitorSmartphone aria-hidden />} href={`${base}/kiosks`} />
        <StatCard label="ผู้ใช้ / โควตา" value={formatQuota(users.used, users.quota)} icon={<Users aria-hidden />} href={`${base}/users`} />
        <StatCard label="ภาพ AI ต่อเดือน" value={org.aiMonthlyQuota == null ? 'ไม่จำกัด' : org.aiMonthlyQuota.toLocaleString('th-TH')} icon={<Sparkles aria-hidden />} href={`${base}/limits`} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="ชื่อและ URL" icon={<Pencil aria-hidden />} className="lg:col-span-2">
          <ActionForm action={updateOrganizationAction.bind(null, org.id)} className="grid gap-5 sm:grid-cols-2">
            <FormField label="ชื่อลูกค้า" name="name" required>
              <Input id="name" name="name" defaultValue={org.name} required disabled={!canManage} />
            </FormField>
            <FormField label="Slug" name="slug" hint="เปลี่ยนแล้ว URL เดิมของลูกค้าจะใช้ไม่ได้">
              <Input id="slug" name="slug" defaultValue={org.slug} pattern="[a-z0-9\-]*" disabled={!canManage} />
            </FormField>
            {canManage ? (
              <div className="sm:col-span-2">
                <SubmitButton>บันทึก</SubmitButton>
              </div>
            ) : null}
          </ActionForm>
        </Card>

        <div className="flex flex-col gap-5">
          <Card title="สถานะบัญชี" subtitle="ระงับแล้วผู้ใช้ของลูกค้าเข้าระบบไม่ได้" icon={<CircleCheck aria-hidden />}>
            <div className="flex items-center justify-between gap-3">
              {org.status === 'active' ? (
                <Badge tone="success" dot>
                  ใช้งานอยู่
                </Badge>
              ) : (
                <Badge tone="danger" dot>
                  ระงับ
                </Badge>
              )}
              {canManage ? (
                org.status === 'active' ? (
                  <ActionForm action={setOrganizationStatusAction.bind(null, org.id, 'suspended')} confirm={`ระงับบัญชี "${org.name}"? ผู้ใช้ของลูกค้าจะเข้าระบบไม่ได้ และตู้จะหยุดรับลูกค้า`}>
                    <SubmitButton variant="danger" size="sm">
                      ระงับบัญชี
                    </SubmitButton>
                  </ActionForm>
                ) : (
                  <ActionForm action={setOrganizationStatusAction.bind(null, org.id, 'active')}>
                    <SubmitButton size="sm">เปิดใช้งาน</SubmitButton>
                  </ActionForm>
                )
              ) : null}
            </div>
          </Card>
          <Card title="การรับเงินจริง" subtitle="เงินเข้าบัญชี Stripe ของบริษัท" icon={<Banknote aria-hidden />}>
            <div className="flex items-center justify-between gap-3">
              {org.livePaymentsAllowed ? (
                <Badge tone="success" dot>
                  อนุญาต
                </Badge>
              ) : (
                <Badge dot>ยังไม่อนุญาต (ทดสอบเท่านั้น)</Badge>
              )}
              {canManage ? (
                <ActionForm
                  action={setLivePaymentsAction.bind(null, org.id, !org.livePaymentsAllowed)}
                  confirm={org.livePaymentsAllowed ? 'ปิดการรับเงินจริงของลูกค้านี้?' : 'อนุญาตให้ตู้ของลูกค้านี้รับเงินจริง?'}
                >
                  <SubmitButton variant="outline" size="sm">
                    {org.livePaymentsAllowed ? 'ปิด' : 'อนุญาต'}
                  </SubmitButton>
                </ActionForm>
              ) : null}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
