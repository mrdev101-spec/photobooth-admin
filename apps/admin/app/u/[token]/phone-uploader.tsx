'use client';

import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Send, X } from 'lucide-react';

const MAX_SIDE = 2000;

/** The photo as a JPEG of at most MAX_SIDE px (phone photos are often 8-12 MB). */
async function shrink(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file); // applies the photo's EXIF rotation
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), 'image/jpeg', 0.88));
}

type Picked = { blob: Blob; url: string };

export function PhoneUploader({ token, count, expiresAt }: { token: string; count: number; expiresAt: string }) {
  const [picked, setPicked] = useState<Picked[]>([]);
  const [state, setState] = useState<'pick' | 'sending' | 'done' | 'error'>('pick');
  const [msg, setMsg] = useState('');
  const [progress, setProgress] = useState(0);
  // Counted on the phone only (the server's render would be a few seconds off)
  const [left, setLeft] = useState<number | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const tick = () => setLeft(Math.max(0, Math.round((Date.parse(expiresAt) - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [expiresAt]);

  const add = async (files: FileList | null) => {
    if (!files) return;
    setMsg('');
    const room = count - picked.length;
    const list = Array.from(files).filter((f) => f.type.startsWith('image/') || /\.(heic|heif|jpe?g|png|webp)$/i.test(f.name)).slice(0, room);
    try {
      const next = await Promise.all(list.map(async (f) => { const blob = await shrink(f); return { blob, url: URL.createObjectURL(blob) }; }));
      setPicked((p) => [...p, ...next].slice(0, count));
    } catch {
      setMsg('เปิดรูปนี้ไม่ได้ ลองเลือกรูปอื่น');
    }
    if (input.current) input.current.value = '';
  };

  const send = async () => {
    setState('sending');
    setMsg('');
    try {
      for (let i = 0; i < picked.length; i++) {
        const r = await fetch(`/u/${token}/files?i=${i}`, { method: 'POST', headers: { 'content-type': 'image/jpeg' }, body: picked[i]!.blob });
        if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error || 'ส่งไม่สำเร็จ');
        setProgress(i + 1);
      }
      const d = await fetch(`/u/${token}/done`, { method: 'POST' });
      if (!d.ok) throw new Error(((await d.json().catch(() => ({}))) as { error?: string }).error || 'ส่งไม่สำเร็จ');
      setState('done');
    } catch (e) {
      setState('error');
      setMsg(e instanceof Error ? e.message : 'ส่งไม่สำเร็จ');
    }
  };

  if (state === 'done') {
    return (
      <div className="rounded-card border border-success-200 bg-success-50 p-6 text-center">
        <p className="text-xl font-bold text-success-800">ส่งรูปแล้ว</p>
        <p className="mt-2 text-success-800">กลับไปที่ตู้ได้เลย รูปของคุณขึ้นที่จอแล้ว</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: count }, (_, i) => {
          const p = picked[i];
          return (
            <div key={i} className="relative aspect-[3/4] overflow-hidden rounded-card border-2 border-dashed border-ink-300 bg-surface">
              {p ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt={`รูปที่ ${i + 1}`} className="size-full object-cover" />
                  {state === 'pick' || state === 'error' ? (
                    <button type="button" aria-label={`เอารูปที่ ${i + 1} ออก`} onClick={() => setPicked((all) => all.filter((_, k) => k !== i))} className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white">
                      <X className="size-4" aria-hidden />
                    </button>
                  ) : null}
                </>
              ) : (
                <button type="button" onClick={() => input.current?.click()} className="flex size-full flex-col items-center justify-center gap-2 text-ink-500">
                  <ImagePlus className="size-8" aria-hidden />
                  <span className="text-sm">รูปที่ {i + 1}</span>
                </button>
              )}
              <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-xs font-semibold text-ink-800">{i + 1}</span>
            </div>
          );
        })}
      </div>
      <input ref={input} type="file" accept="image/*" multiple className="sr-only" onChange={(e) => add(e.target.files)} />
      {picked.length < count ? (
        <button type="button" onClick={() => input.current?.click()} className="h-14 rounded-xl border-2 border-primary-600 bg-surface text-lg font-semibold text-primary-700">
          เลือกรูปจากมือถือ ({picked.length}/{count})
        </button>
      ) : null}
      <button
        type="button"
        disabled={picked.length !== count || state === 'sending' || left === 0}
        onClick={send}
        className="flex h-14 items-center justify-center gap-2 rounded-xl bg-primary-600 text-lg font-semibold text-white disabled:opacity-40"
      >
        <Send className="size-5" aria-hidden />
        {state === 'sending' ? `กำลังส่ง ${progress}/${count}…` : `ส่งรูปเข้าตู้`}
      </button>
      {msg ? <p className="text-center text-sm font-medium text-danger-600" role="alert">{msg}</p> : null}
      <p className="text-center text-xs text-ink-500">{left === null ? ' ' : left > 0 ? `ลิงก์หมดอายุใน ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} นาที` : 'ลิงก์หมดอายุแล้ว สแกน QR ที่ตู้ใหม่อีกครั้ง'}</p>
    </div>
  );
}
