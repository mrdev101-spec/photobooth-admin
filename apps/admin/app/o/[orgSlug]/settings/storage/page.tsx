import type { Metadata } from 'next';
import { requireOrg } from '@/server/auth/context';
import { storageSummary } from '@/server/services/storage';
import { HardDrive } from 'lucide-react';
import { Badge, Card, DetailRow, Notice, PageHeader } from '@/components/ui';

export const metadata: Metadata = { title: 'พื้นที่เก็บภาพ' };

/** Read-only for customers: the platform team manages buckets and keys. */
export default async function StoragePage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const ctx = await requireOrg(orgSlug, 'kiosk.view');
  const s = await storageSummary(ctx.org.id);
  return (
    <>
      <PageHeader title="พื้นที่เก็บภาพ" description="ที่เก็บภาพสำหรับ QR ดาวน์โหลดและออเดอร์จุดรับรูป แยกเฉพาะบัญชีนี้" />
      {s.configured ? (
        <Card className="max-w-2xl" title="Cloudflare R2" subtitle="ผู้ดูแลแพลตฟอร์มเป็นผู้ตั้งค่า" icon={<HardDrive aria-hidden />}>
          <dl className="divide-y divide-ink-100">
            <DetailRow label="สถานะ">{s.lastTestOk === false ? <Badge tone="danger" dot>มีปัญหา — แจ้งผู้ดูแลแพลตฟอร์ม</Badge> : <Badge tone="success" dot>พร้อมใช้งาน</Badge>}</DetailRow>
            <DetailRow label="ลิงก์ภาพ">
              <span className="break-all">{s.publicUrl}</span>
            </DetailRow>
            <DetailRow label="ลบภาพอัตโนมัติหลัง">{s.lifecycleDays} วัน</DetailRow>
          </dl>
          <p className="mt-4 text-sm text-ink-500">ตั้งจำนวนวันที่ลูกค้าเห็นบนหน้าดาวน์โหลดได้ที่การตั้งค่าของแต่ละตู้ (ไม่ควรเกินจำนวนวันด้านบน)</p>
        </Card>
      ) : (
        <Notice tone="warn">บัญชีนี้ยังไม่มีพื้นที่เก็บภาพ ตู้จะเปิด QR ดาวน์โหลดภาพและจุดรับรูปไม่ได้ ติดต่อผู้ดูแลแพลตฟอร์ม</Notice>
      )}
    </>
  );
}
