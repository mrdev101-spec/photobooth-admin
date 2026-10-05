'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import clsx from 'clsx';
import { APP_MODES } from '@photobooth/catalog';

type Result = { ok: boolean; message: string };

/**
 * Current mode of a kiosk + a switch. `reported` is what the kiosk runs now; `setting` what the
 * Admin last sent (they differ until the kiosk is back on its first screen). When the kiosk takes
 * its mode from its งาน / ค่ากลาง (`source`), the shop picks: that layer, or this kiosk only.
 */
export function ModeSwitcher({
  reported,
  setting,
  action,
  disabled,
  compact = false,
  source
}: {
  reported: string | null;
  setting: string | null;
  action: (mode: string, target: 'source' | 'kiosk') => Promise<Result>;
  disabled?: boolean;
  compact?: boolean;
  source?: { ownsMode: boolean; label: string; canSource: boolean };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Result | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const send = (mode: string, target: 'source' | 'kiosk') =>
    start(async () => {
      setAsking(null);
      const r = await action(mode, target);
      setMsg(r);
      if (r.ok) router.refresh();
    });
  const name = (id: string | null) => APP_MODES.find((m) => m.id === id)?.name ?? '—';
  const changing = !!setting && !!reported && setting !== reported;
  return (
    <span className={clsx('inline-flex flex-wrap items-center gap-2', compact ? 'text-sm' : '')}>
      <span className="font-medium text-ink-900">{name(reported ?? setting)}</span>
      {changing ? <span className="text-xs text-warning-700">→ {name(setting)} เมื่อกลับหน้าแรก</span> : null}
      {source ? <span className="text-xs text-ink-500">{source.ownsMode ? '(ตั้งเฉพาะตู้นี้)' : `(ตาม${source.label})`}</span> : null}
      {asking ? (
        <span className="inline-flex flex-wrap items-center gap-1 rounded-md bg-primary-50 px-2 py-1 text-xs">
          เปลี่ยนเป็น {name(asking)} ที่:
          <button type="button" disabled={pending} onClick={() => send(asking, 'source')} className="rounded border border-primary-300 bg-surface px-2 py-0.5 font-medium text-primary-700 hover:bg-primary-100">
            ทุกตู้ที่ใช้{source?.label}
          </button>
          <button type="button" disabled={pending} onClick={() => send(asking, 'kiosk')} className="rounded border border-ink-200 bg-surface px-2 py-0.5 text-ink-700 hover:bg-ink-50">
            เฉพาะตู้นี้
          </button>
          <button type="button" disabled={pending} onClick={() => setAsking(null)} className="px-1 text-ink-500 hover:text-ink-800">
            ยกเลิก
          </button>
        </span>
      ) : null}
      {!disabled && !asking ? (
        <select
          aria-label="เปลี่ยนโหมดตู้"
          value=""
          disabled={pending}
          onChange={(e) => {
            const mode = e.target.value;
            if (!mode) return;
            setMsg(null);
            // Follows its layer: ask where the change goes (a kiosk-only switch stops it following)
            if (source && !source.ownsMode && source.canSource) setAsking(mode);
            else send(mode, 'kiosk');
          }}
          className="h-8 rounded-md border border-ink-200 bg-white px-2 text-xs text-ink-700"
        >
          <option value="">{pending ? 'กำลังส่ง…' : 'เปลี่ยนโหมด…'}</option>
          {APP_MODES.filter((m) => m.id !== (setting ?? reported)).map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      ) : null}
      {msg ? <span className={clsx('text-xs', msg.ok ? 'text-success-700' : 'text-danger-600')}>{msg.message}</span> : null}
    </span>
  );
}
