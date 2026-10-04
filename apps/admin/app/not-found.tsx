import Link from 'next/link';
import { SearchX } from 'lucide-react';
import { EmptyState, buttonClass } from '@/components/ui';

export default function NotFound() {
  return (
    <main className="mx-auto max-w-lg px-4 py-20">
      <EmptyState
        title="ไม่พบหน้านี้"
        icon={<SearchX aria-hidden />}
        action={
          <Link href="/" className={buttonClass('outline')}>
            กลับหน้าแรก
          </Link>
        }
      >
        หน้านี้ไม่มีอยู่ หรือคุณไม่มีสิทธิ์เข้าถึง
      </EmptyState>
    </main>
  );
}
