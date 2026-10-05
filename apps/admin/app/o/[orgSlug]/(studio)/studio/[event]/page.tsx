import type { Metadata } from 'next';
import { KioskGrid, PhotoWall, PrintQueue, SalesStats } from '../_components/live';
import { StudioTitle } from '../_components/studio-shell';

export const metadata: Metadata = { title: 'ภาพรวมสด' };

/** At a glance: kiosks, what needs attention in the print queue, the latest photos. */
export default function StudioLivePage() {
  return (
    <div className="flex flex-col gap-5">
      <StudioTitle title="ภาพรวมสด" description="ข้อมูลของวันนี้ อัปเดตทุก 3 วินาที" />
      <SalesStats />
      <KioskGrid compact />
      <div className="grid gap-5 xl:grid-cols-5">
        <div className="xl:col-span-3">
          <PrintQueue onlyActive limit={10} />
        </div>
        <div className="xl:col-span-2">
          <PhotoWall limit={9} />
        </div>
      </div>
    </div>
  );
}
