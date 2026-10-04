'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { Link2 } from 'lucide-react';
import { buttonClass } from '@/components/ui';
import { createPairCodeAction, pairStateAction } from '../actions';

const POLL_MS = 3000;

/**
 * Shows a one-time pairing code with its countdown and watches for the kiosk to pair.
 * The code only lives in this component's state: it is never stored or shown again.
 */
export function PairingPanel({ orgSlug, kioskRowId, autoStart }: { orgSlug: string; kioskRowId: string; autoStart: boolean }) {
  const router = useRouter();
  const [code, setCode] = useState<{ code: string; expiresAt: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [paired, setPaired] = useState(false);
  const [pending, startTransition] = useTransition();
  const started = useRef(false);
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);

  const generate = () =>
    startTransition(async () => {
      setError(null);
      const r = await createPairCodeAction(orgSlug, kioskRowId);
      if (r.error || !r.code || !r.expiresAt) setError(r.error ?? 'สร้างรหัสไม่สำเร็จ');
      else setCode({ code: r.code, expiresAt: Date.parse(r.expiresAt) });
    });

  useEffect(() => {
    if (autoStart && !started.current) {
      started.current = true;
      generate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  const remaining = code ? Math.max(0, code.expiresAt - now) : 0;
  const active = !!code && remaining > 0 && !paired;

  useEffect(() => {
    if (!active) return;
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    const poll = window.setInterval(async () => {
      const s = await pairStateAction(orgSlug, kioskRowId);
      if (s.status === 'active') {
        setPaired(true);
        router.refresh();
      }
    }, POLL_MS);
    return () => {
      window.clearInterval(tick);
      window.clearInterval(poll);
    };
  }, [active, orgSlug, kioskRowId, router]);

  if (paired) {
    return (
      <div role="status" className="rounded-card border border-success-600/30 bg-success-50 p-5 text-success-700">
        <p className="font-semibold">เชื่อมต่อตู้สำเร็จ</p>
        <p className="mt-1 text-sm">ตู้จะส่งสถานะเข้ามาภายใน 1 นาที</p>
      </div>
    );
  }

  const mm = Math.floor(remaining / 60000);
  const ss = String(Math.floor((remaining % 60000) / 1000)).padStart(2, '0');

  return (
    <div className="rounded-card border border-info-600/30 bg-info-50 p-5">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-ink-900"><Link2 className="size-5 text-primary-600" aria-hidden />จับคู่ตู้กับ Web Admin</h2>
      <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-ink-600">
        <li>ที่ตู้ แตะโลโก้มุมซ้ายบน 3 ครั้ง แล้วกรอกรหัสผู้ดูแล</li>
        <li>
          ไปที่ <b>การตั้งค่า › การเชื่อมต่อ Web Admin</b>
        </li>
        <li>
          กรอก URL <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-ink-900">{origin}</code> และรหัสจับคู่ด้านล่าง
        </li>
      </ol>

      {active ? (
        <div className="mt-5 flex flex-wrap items-end gap-6">
          <div>
            <p className="text-xs font-semibold text-ink-500">รหัสจับคู่</p>
            <p className="rounded-lg border border-ink-200 bg-surface px-4 py-2 font-mono text-4xl font-bold tracking-[0.2em] text-ink-900 select-all" aria-live="polite">
              {code!.code}
            </p>
          </div>
          <div className="text-sm text-ink-600">
            <p>
              หมดอายุใน{' '}
              <span className="font-semibold tabular-nums">
                {mm}:{ss}
              </span>
            </p>
            <p className="flex items-center gap-2">
              <span aria-hidden className="inline-block size-2 animate-pulse rounded-full bg-info-600" /> รอตู้เชื่อมต่อ…
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-5">
          {code ? <p className="mb-3 text-sm text-warning-700">รหัสหมดอายุแล้ว สร้างรหัสใหม่เพื่อจับคู่</p> : null}
          <button type="button" onClick={generate} disabled={pending} className={buttonClass()}>
            {pending ? 'กำลังสร้าง…' : code ? 'สร้างรหัสใหม่' : 'สร้างรหัสจับคู่'}
          </button>
        </div>
      )}
      {active ? (
        <button type="button" onClick={generate} disabled={pending} className={`${buttonClass('ghost', 'sm')} mt-3`}>
          สร้างรหัสใหม่ (รหัสเดิมจะใช้ไม่ได้)
        </button>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 text-sm text-danger-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
