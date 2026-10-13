import type { Metadata, Viewport } from 'next';
import { uploadByToken } from '@/server/services/phone-uploads';
import { PhoneUploader } from './phone-uploader';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'ส่งรูปเข้าตู้ถ่ายภาพ', robots: { index: false, follow: false } };
export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

/** The customer's phone: pick photos and send them to the kiosk that showed the QR. */
export default async function PhoneUploadPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const up = await uploadByToken(token);
  return (
    <main className="min-h-dvh bg-canvas px-4 py-6">
      <div className="mx-auto flex max-w-md flex-col gap-5">
        <header className="text-center">
          <h1 className="text-2xl font-bold text-ink-900">ส่งรูปเข้าตู้ถ่ายภาพ</h1>
          {up ? <p className="mt-1 text-ink-600">เลือก {up.count} รูปจากมือถือ แล้วกดส่ง รูปจะขึ้นที่ตู้ทันที</p> : null}
        </header>
        {up ? (
          <PhoneUploader token={token} count={up.count} expiresAt={up.expiresAt.toISOString()} />
        ) : (
          <p className="rounded-card border border-ink-200 bg-surface p-5 text-center text-ink-700">ลิงก์นี้หมดอายุหรือใช้ไปแล้ว • สแกน QR ที่ตู้ใหม่อีกครั้ง</p>
        )}
        <p className="text-center text-xs text-ink-500">รูปถูกส่งไปที่ตู้เท่านั้น และลบจากระบบทันทีที่ตู้รับไปแล้ว</p>
      </div>
    </main>
  );
}
