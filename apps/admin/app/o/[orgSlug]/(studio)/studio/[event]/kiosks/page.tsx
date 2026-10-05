import type { Metadata } from 'next';
import { KioskGrid } from '../../_components/live';
import { StudioTitle } from '../../_components/studio-shell';

export const metadata: Metadata = { title: 'ตู้' };

export default function StudioKiosksPage() {
  return (
    <>
      <StudioTitle title="ตู้ในงาน" description="สถานะการเชื่อมต่อ หน้าจอ และเครื่องพิมพ์ของแต่ละตู้ • ตั้งค่าด่วนเฉพาะตู้ได้จากการ์ด" />
      <KioskGrid />
    </>
  );
}
