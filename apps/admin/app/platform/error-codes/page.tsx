import type { Metadata } from 'next';
import { listErrorCodes } from '@photobooth/error-codes';
import { requirePlatform } from '@/server/auth/context';
import { Badge, PageHeader, Table, Td, Th } from '@/components/ui';

export const metadata: Metadata = { title: 'รหัสข้อผิดพลาด' };

export default async function ErrorCodesPage() {
  await requirePlatform();
  const codes = listErrorCodes();
  return (
    <>
      <PageHeader title="รหัสข้อผิดพลาด" description={`${codes.length} รหัส ชุดเดียวกับตู้ (aiErrorCodes.json) รวมกลุ่ม AD ของ Admin`} />
      <Table>
        <thead>
          <tr>
            <Th>รหัส</Th>
            <Th>ปัญหา</Th>
            <Th>สาเหตุ</Th>
            <Th>วิธีแก้</Th>
          </tr>
        </thead>
        <tbody>
          {codes.map((c) => (
            <tr key={c.code} className="align-top">
              <Td className="whitespace-nowrap">
                <code className="rounded-md bg-ink-100 px-2 py-0.5 font-mono text-sm font-semibold text-ink-900">{c.code}</code>
                <div className="mt-1">{c.retryable ? <Badge tone="info">ลองใหม่ได้</Badge> : null}</div>
              </Td>
              <Td className="min-w-48 font-semibold text-ink-900">{c.title}</Td>
              <Td className="min-w-64 text-ink-600">{c.cause}</Td>
              <Td className="min-w-64 text-ink-600">{c.fix}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </>
  );
}
