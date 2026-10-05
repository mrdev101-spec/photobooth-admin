'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { buttonClass } from '@/components/ui';
import { setShopTemplateStatusAction } from './studio-actions';

/** Stop / restart offering one of the shop's own templates on its kiosks. */
export function ShopStatusButton({ orgSlug, kind, id, retired }: { orgSlug: string; kind: string; id: string; retired: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState('');
  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        className={buttonClass(retired ? 'outline' : 'ghost', 'sm')}
        onClick={() =>
          start(async () => {
            const r = await setShopTemplateStatusAction(orgSlug, kind, id, retired ? 'published' : 'retired');
            setMsg(r.ok ? (r.message ?? '') : r.message);
            if (r.ok) router.refresh();
          })
        }
      >
        {retired ? 'เปิดใช้อีกครั้ง' : 'เลิกใช้'}
      </button>
      {msg ? <span className="text-xs text-ink-500">{msg}</span> : null}
    </span>
  );
}
