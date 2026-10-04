'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import clsx from 'clsx';
import { ImagePlus, Rocket, Save, Undo2 } from 'lucide-react';
import type { AiSceneSpec } from '@photobooth/contracts';
import { Button, buttonClass } from '@/components/ui';
import { discardDraftAction, publishDraftAction, removeFileAction, saveDraftAction, uploadFileAction } from '../../../studio-actions';
import type { EditorFile } from './frame-editor';

const IMAGES = [
  { slot: 'plate', label: 'ฉากต้นแบบ', help: 'ภาพฉากที่ AI ใช้อ้างอิง (บังคับ)' },
  { slot: 'female', label: 'ตัวอย่างผู้หญิง', help: 'แสดงให้ลูกค้าเลือกที่ตู้' },
  { slot: 'male', label: 'ตัวอย่างผู้ชาย', help: 'แสดงให้ลูกค้าเลือกที่ตู้' }
] as const;

export function AiSceneEditor({
  id,
  initialSpec,
  files,
  draftVersion,
  hasPublished,
  issues
}: {
  id: string;
  initialSpec: AiSceneSpec;
  files: Partial<Record<'plate' | 'female' | 'male', EditorFile>>;
  draftVersion: number | null;
  hasPublished: boolean;
  issues: string[];
}) {
  const router = useRouter();
  const [spec, setSpec] = useState<AiSceneSpec>(initialSpec);
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const save = async () => {
    const fd = new FormData();
    fd.set('spec', JSON.stringify(spec));
    fd.set('note', note);
    const r = await saveDraftAction('ai-scene', id, fd);
    setMsg({ ok: r.ok, text: r.message ?? '' });
    if (r.ok) {
      setNote('');
      router.refresh();
    }
    return r.ok;
  };
  const upload = (slot: string, file: File | undefined) => {
    if (!file) return;
    start(async () => {
      const fd = new FormData();
      fd.set('slot', slot);
      fd.set('file', file);
      const r = await uploadFileAction('ai-scene', id, fd);
      setMsg({ ok: r.ok, text: r.message ?? '' });
      if (r.ok) router.refresh();
    });
  };

  return (
    <div className="grid gap-5 pb-24 xl:grid-cols-[minmax(0,1fr)_380px]">
      <section className="rounded-card border border-ink-200 bg-surface p-4 shadow-card">
        <h3 className="mb-3 font-semibold text-ink-900">ภาพของฉาก</h3>
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {IMAGES.map((img) => {
            const f = files[img.slot];
            return (
              <li key={img.slot} className="flex flex-col gap-2">
                <div className="flex aspect-[2/3] items-center justify-center overflow-hidden rounded-card border border-ink-200 bg-ink-50">
                  {f ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={f.url} alt="" className="size-full object-cover" />
                  ) : (
                    <ImagePlus className="size-10 text-ink-300" aria-hidden />
                  )}
                </div>
                <div className="text-sm font-medium text-ink-900">{img.label}</div>
                <div className="text-xs text-ink-500">{img.help}</div>
                <div className="flex gap-2">
                  <label className={buttonClass('outline', 'sm', 'cursor-pointer')}>
                    {f ? 'เปลี่ยน' : 'อัปโหลด'}
                    <input type="file" accept="image/jpeg,image/png" className="sr-only" disabled={pending} onChange={(e) => upload(img.slot, e.target.files?.[0])} />
                  </label>
                  {f ? (
                    <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => start(async () => { const r = await removeFileAction('ai-scene', id, img.slot); if (r.ok) router.refresh(); })}>
                      ลบ
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="flex flex-col gap-4">
        <section className="rounded-card border border-ink-200 bg-surface p-4 shadow-card">
          <h3 className="mb-3 font-semibold text-ink-900">คำอธิบายฉากสำหรับ AI</h3>
          <textarea
            value={spec.prompt}
            onChange={(e) => setSpec({ ...spec, prompt: e.target.value })}
            rows={9}
            maxLength={4000}
            placeholder="เช่น A cinematic movie poster of the person standing on a rainy neon-lit street at night..."
            className="w-full rounded-lg border border-ink-200 p-3 text-sm"
          />
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm text-ink-700">
              เพศของฉากต้นแบบ
              <select value={spec.baseGender} onChange={(e) => setSpec({ ...spec, baseGender: e.target.value as AiSceneSpec['baseGender'] })} className="h-10 rounded-lg border border-ink-200 px-2">
                <option value="any">ทุกเพศ</option>
                <option value="female">ผู้หญิง</option>
                <option value="male">ผู้ชาย</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm text-ink-700">
              สีประจำฉาก
              <input type="color" value={spec.accent} onChange={(e) => setSpec({ ...spec, accent: e.target.value.toUpperCase() })} className="h-10 w-full rounded-lg border border-ink-200" />
            </label>
          </div>
        </section>
        {issues.length ? (
          <section className="rounded-card border border-warning-200 bg-warning-50 p-4 text-sm text-warning-800">
            <p className="mb-1 font-semibold">ต้องแก้ก่อนเผยแพร่</p>
            <ul className="list-disc pl-5">
              {issues.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-ink-200 bg-surface/95 px-4 py-3 backdrop-blur lg:left-64">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
          <span className="text-sm text-ink-600">{draftVersion ? `ร่างเวอร์ชัน ${draftVersion}` : 'แก้ไขแล้วจะสร้างร่างเวอร์ชันใหม่'}</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="บันทึกการเปลี่ยนแปลง (ไม่บังคับ)" className="h-10 min-w-48 flex-1 rounded-lg border border-ink-200 px-3 text-sm" />
          <Button type="button" variant="outline" disabled={pending} onClick={() => start(async () => void (await save()))}>
            <Save className="size-4" aria-hidden />
            บันทึกร่าง
          </Button>
          <Button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                if (!(await save())) return;
                const r = await publishDraftAction('ai-scene', id);
                setMsg({ ok: r.ok, text: r.message ?? '' });
                if (r.ok) router.refresh();
              })
            }
          >
            <Rocket className="size-4" aria-hidden />
            บันทึกและเผยแพร่
          </Button>
          {draftVersion && hasPublished ? (
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  if (!window.confirm('ยกเลิกร่างนี้?')) return;
                  const r = await discardDraftAction('ai-scene', id);
                  setMsg({ ok: r.ok, text: r.message ?? '' });
                  if (r.ok) router.refresh();
                })
              }
            >
              <Undo2 className="size-4" aria-hidden />
              ยกเลิกร่าง
            </Button>
          ) : null}
          {msg ? (
            <span role={msg.ok ? 'status' : 'alert'} className={clsx('text-sm font-medium', msg.ok ? 'text-success-700' : 'text-danger-600')}>
              {msg.text}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
