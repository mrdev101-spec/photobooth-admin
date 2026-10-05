import type { Metadata } from 'next';
import { PhotoWall } from '../../_components/live';
import { StudioTitle } from '../../_components/studio-shell';

export const metadata: Metadata = { title: 'ภาพลูกค้า' };

export default function StudioPhotosPage() {
  return (
    <>
      <StudioTitle title="ภาพลูกค้า" description="ภาพย่อของออเดอร์วันนี้ • ภาพเต็มอยู่ในพื้นที่เก็บภาพของร้าน" />
      <PhotoWall large />
    </>
  );
}
