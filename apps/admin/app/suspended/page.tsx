import Link from 'next/link';
import { CirclePause } from 'lucide-react';
import { EmptyState, buttonClass } from '@/components/ui';

export default function SuspendedPage() {
  return (
    <main className="mx-auto max-w-lg px-4 py-20">
      <EmptyState
        title="บัญชีนี้ถูกระงับชั่วคราว"
        icon={<CirclePause aria-hidden />}
        action={
          <Link href="/select-org" className={buttonClass('outline')}>
            เลือกบัญชีอื่น
          </Link>
        }
      >
        ติดต่อผู้ดูแลแพลตฟอร์มเพื่อเปิดใช้งานอีกครั้ง
      </EmptyState>
    </main>
  );
}
