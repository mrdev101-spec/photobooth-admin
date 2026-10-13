import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, History, Info, MonitorSmartphone, Pencil } from 'lucide-react';
import { requirePlatform } from '@/server/auth/context';
import { canPlatform } from '@/server/auth/rbac';
import { templateDetail } from '@/server/services/catalog';
import { Badge, Card, DetailRow, EmptyState, PageHeader, Table, Td, Th, buttonClass } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import { RollbackButton } from './rollback-button';
import { TemplatePreview } from '@/components/template-preview';
import { TEMPLATE_KINDS, type TemplateKind } from '@/lib/template-visibility';
import { TemplateStatusButton } from '../../status-button';

export const metadata: Metadata = { title: 'รายละเอียด Template' };

const KIOSK_STATUS: Record<string, string> = { active: 'ใช้งาน', disabled: 'ถูกปิดใช้งาน', pending: 'รอจับคู่' };

export default async function TemplateDetailPage({ params }: { params: Promise<{ kind: string; id: string }> }) {
  const ctx = await requirePlatform();
  const { kind, id } = await params;
  const section = TEMPLATE_KINDS.find((k) => k.kind === kind);
  if (!section) notFound();
  const detail = await templateDetail(kind as TemplateKind, id);
  if (!detail) notFound();
  const { item, kiosks, kiosksTotal, versions, template } = detail;
  const uploaded = item.source === 'uploaded';
  const canManage = canPlatform(ctx.user.platformRole, 'platform.catalog');
  const customers = new Set(kiosks.map((k) => k.orgId)).size;
  const previews = item.gallery ?? (item.image ? [{ src: item.image, label: 'ภาพตัวอย่าง' }] : []);

  return (
    <>
      <PageHeader
        breadcrumb={
          <Link href={`/platform/templates?kind=${item.kind}`} className="inline-flex items-center gap-1 hover:text-ink-900">
            <ChevronLeft className="size-4" aria-hidden />
            คลัง Template • {section.label}
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            {item.name}
            {item.status === 'published' ? (
              <Badge tone="success" dot>
                เปิดใช้
              </Badge>
            ) : item.status === 'draft' ? (
              <Badge tone="warning" dot>
                ร่าง ยังไม่เผยแพร่
              </Badge>
            ) : (
              <Badge tone="neutral" dot>
                เลิกใช้
              </Badge>
            )}
          </span>
        }
        description={item.desc}
        actions={
          canManage ? (
            <div className="flex items-start gap-2">
              {uploaded ? (
                <Link href={`/platform/templates/${item.kind}/${item.id}/edit`} className={buttonClass(item.status === 'draft' ? 'primary' : 'outline')}>
                  <Pencil className="size-4" aria-hidden />
                  {item.status === 'draft' ? 'แก้ไขและเผยแพร่' : 'แก้ไข'}
                </Link>
              ) : null}
              {item.status !== 'draft' ? <TemplateStatusButton kind={item.kind} id={item.id} name={item.name} status={item.status} kiosks={kiosks.length} size="md" /> : null}
            </div>
          ) : null
        }
      />

      <div className="grid gap-5 xl:grid-cols-3">
        <Card title="ภาพตัวอย่าง" subtitle={uploaded ? 'ไฟล์ที่อัปโหลดและภาพตัวอย่างที่ระบบสร้างจากช่องที่วางไว้' : item.kind === 'ai-scene' ? 'ฉากต้นแบบและภาพตัวอย่างจากชุดข้อมูลของตู้' : 'สร้างด้วยโค้ดเดียวกับที่ตู้ใช้พิมพ์ ด้วยภาพถ่ายตัวอย่าง'} className="xl:col-span-2">
          {previews.length ? (
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {previews.map((p) => (
                <li key={p.src} className="flex flex-col gap-2">
                  <a href={p.src} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-card border border-ink-200">
                    <TemplatePreview kind={item.kind} src={p.src} />
                  </a>
                  <span className="text-center text-sm text-ink-600">{p.label}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="max-w-56 overflow-hidden rounded-card border border-ink-200">
              <TemplatePreview kind={item.kind} />
            </div>
          )}
        </Card>

        <div className="flex flex-col gap-5">
          <Card title="รายละเอียด" icon={<Info aria-hidden />}>
            <dl className="flex flex-col">
              <DetailRow label="รหัส">
                <code className="font-mono text-sm">{item.id}</code>
              </DetailRow>
              <DetailRow label="หมวด">{section.label}</DetailRow>
              <DetailRow label="ใช้ในโหมด">{section.desc}</DetailRow>
              {item.tag ? <DetailRow label="ป้าย">{item.tag}</DetailRow> : null}
              {item.facts?.map((f) => (
                <DetailRow key={f.label} label={f.label}>
                  {f.value}
                </DetailRow>
              ))}
              <DetailRow label="ที่มา">
                {uploaded ? 'อัปโหลดโดยส่วนกลาง (ตู้ดาวน์โหลดจาก manifest)' : item.kind === 'ai-scene' ? 'ในตัว (มากับเวอร์ชันตู้)' : 'ในตัว (วาดโดยโปรแกรมของตู้ มากับเวอร์ชันตู้)'}
              </DetailRow>
            </dl>
          </Card>
        </div>
      </div>

      {uploaded ? (
        <Card className="mt-5" flush title="เวอร์ชัน" subtitle="เวอร์ชันที่เผยแพร่แล้วแก้ไม่ได้ การแก้ไขสร้างเวอร์ชันใหม่ ย้อนกลับได้" icon={<History aria-hidden />}>
          <Table bare>
            <thead>
              <tr>
                <Th>เวอร์ชัน</Th>
                <Th>สถานะ</Th>
                <Th>บันทึก</Th>
                <Th>เผยแพร่ / แก้ล่าสุด</Th>
                <Th className="text-right">จัดการ</Th>
              </tr>
            </thead>
            <tbody>
              {[...versions].reverse().map((v) => {
                const live = v.version === template?.publishedVersion;
                return (
                  <tr key={v.id}>
                    <Td className="font-semibold tabular-nums">v{v.version}</Td>
                    <Td>
                      {live ? (
                        <Badge tone="success" dot>
                          ใช้งานอยู่
                        </Badge>
                      ) : v.publishedAt ? (
                        <Badge tone="neutral">เคยเผยแพร่</Badge>
                      ) : (
                        <Badge tone="warning">ร่าง</Badge>
                      )}
                    </Td>
                    <Td className="text-ink-600">{v.note ?? '-'}</Td>
                    <Td className="whitespace-nowrap text-ink-600">{formatDateTime(v.publishedAt ?? v.updatedAt)}</Td>
                    <Td className="text-right">{canManage && v.publishedAt && !live ? <RollbackButton kind={item.kind} id={item.id} version={v.version} /> : null}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      ) : null}

      <Card
        className="mt-5"
        flush
        title="ตู้ที่แสดง template นี้"
        subtitle={`${kiosks.length} จาก ${kiosksTotal} ตู้ • ${customers} ลูกค้า${item.status === 'retired' ? ' • เลิกใช้อยู่ ตู้เหล่านี้จะกลับมาแสดงเมื่อเปิดใช้อีกครั้ง' : ''}`}
        icon={<MonitorSmartphone aria-hidden />}
      >
        {kiosks.length ? (
          <Table bare>
            <thead>
              <tr>
                <Th>ลูกค้า</Th>
                <Th>ตู้</Th>
                <Th>สถานะตู้</Th>
              </tr>
            </thead>
            <tbody>
              {kiosks.map((k) => (
                <tr key={k.kioskRowId} className="hover:bg-ink-50">
                  <Td>
                    <Link href={`/platform/kiosks/${k.kioskRowId}`} className="font-semibold text-ink-900 hover:text-primary-700">
                      {k.orgName}
                    </Link>
                  </Td>
                  <Td>{k.kioskName}</Td>
                  <Td className="text-ink-600">{KIOSK_STATUS[k.kioskStatus] ?? k.kioskStatus}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState title="ยังไม่มีตู้ที่แสดง" icon={<MonitorSmartphone aria-hidden />}>
            ลูกค้าเลือกแสดงได้ในเมนู Template ของตัวเอง
          </EmptyState>
        )}
      </Card>
    </>
  );
}
