'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Button } from '@/components/ui';
import { rollbackAction } from '../../studio-actions';

/** Makes an older published version live again. */
export function RollbackButton({ kind, id, version }: { kind: string; id: string; version: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          if (!window.confirm(`กลับไปใช้เวอร์ชัน ${version} ในทุกตู้?`)) return;
          const r = await rollbackAction(kind, id, version);
          if (!r.ok) window.alert(r.message);
          router.refresh();
        })
      }
    >
      {pending ? 'กำลังย้อน…' : 'ใช้เวอร์ชันนี้'}
    </Button>
  );
}
