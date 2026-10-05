'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import clsx from 'clsx';
import { Bell, BellOff, CheckCircle2, Clock, Maximize, Printer, ScanLine, Search, Volume2, VolumeX } from 'lucide-react';
import { Badge, buttonClass } from '@/components/ui';
import { STATUS_LABELS } from '@/lib/order-labels';
import type { CounterOrder } from './serialize';
import { claimAction, handOverAction, lookupAction } from './actions';

const POLL_MS = 4000;
const LATE_MIN = 15;

function minutesAgo(iso: string, now: number) {
  return Math.max(0, Math.floor((now - Date.parse(iso)) / 60000));
}
function agoLabel(iso: string, now: number) {
  const m = minutesAgo(iso, now);
  return m < 1 ? 'เมื่อสักครู่' : m < 60 ? `${m} นาทีที่แล้ว` : `${Math.floor(m / 60)} ชม. ${m % 60} นาทีที่แล้ว`;
}
const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' });

/** Two short tones; needs one click first (browsers block audio until the page is used). */
function beep(ctx: AudioContext) {
  const t = ctx.currentTime;
  [880, 1320].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t + i * 0.18);
    gain.gain.exponentialRampToValueAtTime(0.3, t + i * 0.18 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.18 + 0.16);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t + i * 0.18);
    osc.stop(t + i * 0.18 + 0.17);
  });
}

/**
 * The pickup counter (docs §18.3). Left: the waiting queue, refreshed every 4 s, with a sound
 * and a browser notification for each new order. Right: the order being served. A USB
 * barcode scanner types the slip's QR (the download URL) into the always-focused scan box.
 */
export function PickupCounter({ orgSlug, orgName, eventId = null }: { orgSlug: string; orgName: string; eventId?: string | null }) {
  const [waiting, setWaiting] = useState<CounterOrder[]>([]);
  const [recent, setRecent] = useState<CounterOrder[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<CounterOrder | null>(null);
  const [scan, setScan] = useState('');
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [station, setStation] = useState('');
  const [sound, setSound] = useState(false);
  const [notify, setNotify] = useState<NotificationPermission | 'unsupported'>('default');
  const [online, setOnline] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const seen = useRef<Set<string> | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      setStation(localStorage.getItem('pb.station') ?? 'จุดรับรูป 1');
    } catch {
      setStation('จุดรับรูป 1');
    }
    setNotify(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
  }, []);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/o/${orgSlug}/pickup/queue${eventId ? `?event=${encodeURIComponent(eventId)}` : ''}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { waiting: CounterOrder[]; recent: CounterOrder[] };
      setOnline(true);
      setWaiting(data.waiting);
      setLoaded(true);
      setRecent(data.recent);
      const ids = new Set(data.waiting.map((o) => o.id));
      if (seen.current) {
        const arrived = data.waiting.filter((o) => !seen.current!.has(o.id));
        if (arrived.length) {
          setFresh((f) => new Set([...f, ...arrived.map((o) => o.id)]));
          if (audio.current) beep(audio.current);
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            const o = arrived[0]!;
            new Notification(arrived.length > 1 ? `ออเดอร์ใหม่ ${arrived.length} รายการ` : `ออเดอร์ใหม่ ${o.codeLabel}`, { body: `${o.productLabel} • ${o.kioskName}`, tag: 'pb-pickup' });
          }
        }
      }
      seen.current = new Set([...(seen.current ?? []), ...ids]);
      // Keep the open order in sync (another counter may have served it)
      setSelected((s) => (s ? (data.waiting.find((o) => o.id === s.id) ?? data.recent.find((o) => o.id === s.id) ?? s) : s));
    } catch {
      setOnline(false);
    }
  }, [orgSlug]);

  useEffect(() => {
    void poll();
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void poll();
      setNow(Date.now());
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [poll]);

  useEffect(() => {
    document.title = waiting.length ? `(${waiting.length}) รอรับ · จุดรับรูป` : 'จุดรับรูป';
  }, [waiting.length]);

  // The scan box keeps focus unless the user is typing somewhere else
  useEffect(() => {
    const id = window.setInterval(() => {
      const el = document.activeElement;
      if (!el || el === document.body) scanRef.current?.focus();
    }, 800);
    return () => window.clearInterval(id);
  }, []);

  const open = (o: CounterOrder) => {
    setSelected(o);
    setMessage(null);
    setFresh((f) => {
      const n = new Set(f);
      n.delete(o.id);
      return n;
    });
  };

  const lookup = (input: string) =>
    start(async () => {
      const r = await lookupAction(orgSlug, input);
      setScan('');
      if (r.ok) open(r.data);
      else {
        setSelected(null);
        setMessage({ tone: 'error', text: r.error });
      }
    });

  const printOrder = (o: CounterOrder) => {
    // Open the window inside the click itself: browsers block popups opened after an await
    const win = window.open('about:blank', 'pb-print', 'width=520,height=760');
    start(async () => {
      const r = await claimAction(orgSlug, o.id, station);
      if (!r.ok) {
        win?.close();
        setMessage({ tone: 'error', text: r.error });
        return;
      }
      setSelected(r.data);
      const url = `/print/${orgSlug}/${o.id}`;
      if (win && !win.closed) {
        win.location.href = url;
        setMessage({ tone: 'ok', text: 'ส่งไปพิมพ์แล้ว เมื่อได้ภาพครบให้กด “ยืนยันส่งมอบ”' });
      } else {
        setMessage({ tone: 'error', text: `เบราว์เซอร์บล็อกหน้าต่างพิมพ์ อนุญาต pop-up สำหรับเว็บนี้ หรือเปิด ${url}` });
      }
      void poll();
    });
  };

  const handOver = (o: CounterOrder) =>
    start(async () => {
      const r = await handOverAction(orgSlug, o.id);
      if (!r.ok) {
        setMessage({ tone: 'error', text: r.error });
        return;
      }
      setSelected(r.data);
      setMessage({ tone: 'ok', text: `ส่งมอบ ${r.data.codeLabel} แล้ว` });
      void poll();
      scanRef.current?.focus();
    });

  const enableSound = () => {
    if (!audio.current) audio.current = new AudioContext();
    void audio.current.resume();
    beep(audio.current);
    setSound(true);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-card border border-ink-200 bg-surface p-3 shadow-card">
        <form
          className="relative min-w-64 flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (scan.trim()) lookup(scan);
          }}
        >
          <ScanLine className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-ink-400" aria-hidden />
          <input
            ref={scanRef}
            autoFocus
            value={scan}
            onChange={(e) => setScan(e.target.value)}
            placeholder="สแกน QR บนใบรับรูป หรือพิมพ์รหัส เช่น ZHK-6Q6 แล้วกด Enter"
            aria-label="สแกนหรือพิมพ์รหัสรับรูป"
            className="h-12 w-full rounded-lg border border-ink-300 bg-surface pr-24 pl-11 text-lg focus:border-primary-600 focus:ring-2 focus:ring-primary-100 focus:outline-none"
          />
          <button type="submit" disabled={pending || !scan.trim()} className={clsx(buttonClass('primary', 'sm'), 'absolute top-1/2 right-1.5 -translate-y-1/2')}>
            <Search className="size-4" aria-hidden />
            ค้นหา
          </button>
        </form>
        <label className="flex items-center gap-2 text-sm text-ink-600">
          จุด
          <input
            value={station}
            onChange={(e) => {
              setStation(e.target.value);
              try {
                localStorage.setItem('pb.station', e.target.value);
              } catch {
                /* private mode */
              }
            }}
            className="h-10 w-36 rounded-lg border border-ink-300 px-3"
            aria-label="ชื่อจุดรับรูป"
            maxLength={60}
          />
        </label>
        <button type="button" onClick={sound ? () => setSound(false) : enableSound} className={buttonClass(sound ? 'outline' : 'secondary', 'sm', 'h-10')} aria-pressed={sound}>
          {sound ? <Volume2 className="size-4" aria-hidden /> : <VolumeX className="size-4" aria-hidden />}
          {sound ? 'เสียงเปิด' : 'เปิดเสียงแจ้งเตือน'}
        </button>
        {notify !== 'unsupported' ? (
          <button
            type="button"
            disabled={notify !== 'default'}
            onClick={async () => setNotify(await Notification.requestPermission())}
            className={buttonClass('outline', 'sm', 'h-10')}
          >
            {notify === 'granted' ? <Bell className="size-4" aria-hidden /> : <BellOff className="size-4" aria-hidden />}
            {notify === 'granted' ? 'แจ้งเตือนเปิด' : notify === 'denied' ? 'แจ้งเตือนถูกปิดในเบราว์เซอร์' : 'เปิดการแจ้งเตือน'}
          </button>
        ) : null}
        <button type="button" onClick={() => void document.documentElement.requestFullscreen?.()} className={buttonClass('ghost', 'sm', 'h-10')}>
          <Maximize className="size-4" aria-hidden />
          เต็มจอ
        </button>
      </div>

      {!online ? (
        <div role="alert" className="rounded-lg border border-danger-600/30 bg-danger-50 px-4 py-2 text-sm text-danger-700">
          เชื่อมต่อระบบไม่ได้ กำลังลองใหม่… (ตรวจอินเทอร์เน็ตของเครื่องนี้)
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        {/* Queue */}
        <section className="overflow-hidden rounded-card border border-ink-200 bg-surface shadow-card" aria-label="คิวรอรับ">
          <header className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-ink-900">
              <Clock className="size-5 text-primary-600" aria-hidden />
              รอรับ
              <span className="rounded-full bg-primary-600 px-2.5 text-sm font-bold text-white">{waiting.length}</span>
            </h2>
            <span className="flex items-center gap-1.5 text-xs text-ink-500">
              <span className={clsx('size-2 rounded-full', online ? 'animate-pulse bg-success-600' : 'bg-danger-600')} aria-hidden />
              {online ? 'อัปเดตอัตโนมัติ' : 'ออฟไลน์'}
            </span>
          </header>
          <ul className="max-h-[calc(100dvh-16rem)] divide-y divide-ink-100 overflow-y-auto">
            {waiting.length ? (
              waiting.map((o) => {
                const late = minutesAgo(o.orderedAt, now) >= LATE_MIN;
                return (
                  <li key={o.id}>
                    <button
                      type="button"
                      onClick={() => open(o)}
                      aria-current={selected?.id === o.id ? 'true' : undefined}
                      className={clsx(
                        'flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-ink-50',
                        selected?.id === o.id && 'bg-primary-50 shadow-[inset_4px_0_0_var(--color-primary-600)]',
                        fresh.has(o.id) && selected?.id !== o.id && 'bg-warning-50'
                      )}
                    >
                      {o.photo || o.badgeImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={(o.photo ?? o.badgeImage)!} alt="" className="h-16 w-11 shrink-0 rounded border border-ink-200 bg-ink-50 object-cover" loading="lazy" />
                      ) : (
                        <span className="h-16 w-11 shrink-0 rounded border border-ink-200 bg-ink-100" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="font-mono text-lg font-bold tracking-wider text-ink-900">{o.codeLabel}</span>
                          {fresh.has(o.id) ? <Badge tone="warning">ใหม่</Badge> : null}
                          {o.status === 'claimed' ? <Badge tone="info">กำลังพิมพ์</Badge> : null}
                        </span>
                        <span className="block truncate text-sm text-ink-600">
                          {o.productLabel} • {o.kioskName}
                        </span>
                        <span className={clsx('block text-xs', late ? 'font-semibold text-warning-700' : 'text-ink-500')}>
                          {timeLabel(o.orderedAt)} · {agoLabel(o.orderedAt, now)}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })
            ) : (
              <li className="px-4 py-12 text-center text-ink-500">{loaded ? 'ไม่มีออเดอร์รอรับ ออเดอร์ใหม่จะเด้งขึ้นที่นี่' : 'กำลังโหลดคิว…'}</li>
            )}
          </ul>
        </section>

        {/* Order panel */}
        <section className="rounded-card border border-ink-200 bg-surface shadow-card" aria-live="polite">
          {message ? (
            <p role={message.tone === 'error' ? 'alert' : 'status'} className={clsx('m-4 mb-0 rounded-lg px-4 py-3 text-sm font-medium', message.tone === 'error' ? 'bg-danger-50 text-danger-700' : 'bg-success-50 text-success-700')}>
              {message.text}
            </p>
          ) : null}
          {selected ? (
            <OrderPanel order={selected} pending={pending} onPrint={printOrder} onHandOver={handOver} />
          ) : (
            <div className="flex min-h-80 flex-col items-center justify-center gap-3 p-10 text-center text-ink-500">
              <ScanLine className="size-12 text-ink-300" aria-hidden />
              <p className="text-lg font-semibold text-ink-700">สแกนใบรับรูป หรือเลือกออเดอร์จากคิว</p>
              <p className="text-sm">ลูกค้าไม่มีใบรับรูป: ถามเวลาและตู้ที่ถ่าย แล้วดูภาพย่อในคิว · {orgName}</p>
            </div>
          )}

          {recent.length ? (
            <div className="border-t border-ink-100 p-4">
              <p className="mb-2 text-sm font-semibold text-ink-600">ส่งมอบล่าสุด</p>
              <div className="flex flex-wrap gap-2">
                {recent.map((o) => (
                  <button key={o.id} type="button" onClick={() => open(o)} className="rounded-lg border border-ink-200 px-3 py-1.5 font-mono text-sm hover:bg-ink-50">
                    {o.codeLabel}
                    {o.reprintAllowance ? <span className="ml-1.5 text-xs text-info-700">(พิมพ์ซ้ำได้)</span> : null}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function OrderPanel({ order: o, pending, onPrint, onHandOver }: { order: CounterOrder; pending: boolean; onPrint: (o: CounterOrder) => void; onHandOver: (o: CounterOrder) => void }) {
  const st = STATUS_LABELS[o.status] ?? { label: o.status, tone: 'neutral' as const };
  const canPrint = o.status === 'uploaded' || o.status === 'claimed' || (o.status === 'handed_over' && o.reprintAllowance > 0);
  return (
    <div className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-4xl font-bold tracking-widest text-ink-900">{o.codeLabel}</p>
          <p className="mt-1 text-ink-600">
            {o.productLabel} • {o.kioskName}
            {o.branchName ? ` (${o.branchName})` : ''} • สั่งเมื่อ {timeLabel(o.orderedAt)}
          </p>
        </div>
        <Badge tone={st.tone} dot className="text-base">
          {st.label}
        </Badge>
      </div>

      <div className="mt-5 flex flex-wrap gap-4">
        {o.photo ? (
          <figure>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={o.photo} alt={`ภาพ 4x6 ของออเดอร์ ${o.codeLabel}`} className="h-72 w-auto rounded-lg border border-ink-200 bg-ink-50 object-contain shadow-card" />
            <figcaption className="mt-1 text-center text-sm text-ink-500">ภาพ 4x6</figcaption>
          </figure>
        ) : null}
        {o.badgeImage ? (
          <figure>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={o.badgeImage} alt={`เข็มกลัดของออเดอร์ ${o.codeLabel}`} className="size-48 rounded-full border border-ink-200 bg-ink-50 object-cover shadow-card" />
            <figcaption className="mt-1 text-center text-sm text-ink-500">
              เข็มกลัด {o.badge ? `${o.badge.size} มม. × ${o.badge.copies}` : ''}
            </figcaption>
          </figure>
        ) : null}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {canPrint ? (
          <button type="button" onClick={() => onPrint(o)} disabled={pending} className={buttonClass('primary', 'lg')}>
            <Printer className="size-5" aria-hidden />
            {o.status === 'uploaded' ? 'พิมพ์และส่งมอบ' : o.status === 'claimed' ? 'พิมพ์อีกครั้ง' : 'พิมพ์ซ้ำ (ได้รับอนุญาต)'}
          </button>
        ) : null}
        {o.status === 'claimed' ? (
          <button type="button" onClick={() => onHandOver(o)} disabled={pending} className={buttonClass('outline', 'lg')}>
            <CheckCircle2 className="size-5" aria-hidden />
            ยืนยันส่งมอบ (พิมพ์ออกมาครบ)
          </button>
        ) : null}
        {o.status === 'handed_over' && !o.reprintAllowance ? (
          <p className="text-ink-600">
            รับไปแล้ว{o.handedOverAt ? ` เมื่อ ${new Date(o.handedOverAt).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' })}` : ''}
            {o.claimedStation ? ` ที่ ${o.claimedStation}` : ''} • ถ้าต้องพิมพ์ซ้ำ ให้ผู้จัดการกด “อนุญาตพิมพ์ซ้ำ” ในหน้าออเดอร์
          </p>
        ) : null}
        {o.status === 'expired' ? <p className="text-ink-600">ออเดอร์หมดอายุแล้ว ภาพถูกลบตามเวลาที่ตั้ง</p> : null}
      </div>
    </div>
  );
}
