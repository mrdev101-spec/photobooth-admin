'use client';

import { useEffect } from 'react';
import { TriangleAlert } from 'lucide-react';
import { EmptyState, buttonClass } from '@/components/ui';

/**
 * Fallback for an unexpected error inside a page (error.tsx boundaries). In production the
 * message is hidden by Next; the digest matches the server log entry for support.
 */
export function ErrorView({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <EmptyState
        title="เกิดข้อผิดพลาดที่ไม่คาดคิด"
        icon={<TriangleAlert aria-hidden />}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" className={buttonClass('primary')} onClick={() => retry()}>
              ลองใหม่
            </button>
            <a href="/" className={buttonClass('outline')}>
              กลับหน้าแรก
            </a>
          </div>
        }
      >
        ระบบทำรายการนี้ไม่สำเร็จ ลองใหม่อีกครั้ง ถ้ายังไม่ได้ให้แจ้งผู้ดูแลพร้อมรหัสอ้างอิงด้านล่าง
        {error.digest ? <span className="mt-2 block font-mono text-xs text-ink-500">รหัสอ้างอิง: {error.digest}</span> : null}
      </EmptyState>
    </div>
  );
}
