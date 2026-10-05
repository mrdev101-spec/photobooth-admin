import type { Metadata } from 'next';
import { PrintQueue } from '../../_components/live';
import { StudioTitle } from '../../_components/studio-shell';

export const metadata: Metadata = { title: 'คิวพิมพ์' };

export default function StudioQueuePage() {
  return (
    <>
      <StudioTitle title="คิวพิมพ์" description="งานพิมพ์ทั้งหมดของวันนี้ • พิมพ์ซ้ำหรือยกเลิกงานที่ค้างได้ทันที" />
      <PrintQueue />
    </>
  );
}
