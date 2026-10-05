'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import clsx from 'clsx';
import { ImagePlus, Rocket, Save, Undo2 } from 'lucide-react';
import type { AiSceneBrief, AiSceneSpec } from '@photobooth/contracts';
import { AI_SCENE_CATEGORIES } from '@photobooth/catalog';
import { Button, buttonClass } from '@/components/ui';
import { discardDraftAction, publishDraftAction, removeFileAction, saveDraftAction, uploadFileAction } from '../../../studio-actions';
import type { EditorFile } from './frame-editor';

const IMAGES = [
  { slot: 'plate', label: 'ฉากต้นแบบ', help: 'ภาพฉากที่ AI ใช้อ้างอิง (บังคับ)' },
  { slot: 'female', label: 'ตัวอย่างผู้หญิง', help: 'แสดงให้ลูกค้าเลือกที่ตู้' },
  { slot: 'male', label: 'ตัวอย่างผู้ชาย', help: 'แสดงให้ลูกค้าเลือกที่ตู้' }
] as const;

const EMPTY_BRIEF: AiSceneBrief = {
  style: 'poster',
  thaiText: false,
  genre: '',
  title: '',
  titleStyle: '',
  titlePos: '',
  tagline: '',
  taglinePos: '',
  setting: '',
  lighting: '',
  female: '',
  male: '',
  hairFemale: '',
  hairMale: '',
  pose: '',
  framing: '',
  camera: ''
};

// The brief's fields, in English for the AI (Thai only for a Thai title)
const BRIEF_FIELDS: { key: Exclude<keyof AiSceneBrief, 'style' | 'thaiText'>; label: string; hint: string; rows?: number; required?: boolean }[] = [
  { key: 'genre', label: 'แนวภาพ', hint: 'เช่น bold high-fashion magazine cover', required: true },
  { key: 'setting', label: 'ฉากและสถานที่', hint: 'เช่น a minimalist studio with a gold gradient backdrop', rows: 2, required: true },
  { key: 'lighting', label: 'แสง', hint: 'เช่น dramatic beauty dish key light, warm gold rim light', required: true },
  { key: 'title', label: 'ชื่อบนภาพ', hint: 'คำที่อยู่บนโปสเตอร์ (ภาษาไทยได้ ติ๊ก "ชื่อเป็นภาษาไทย")' },
  { key: 'titleStyle', label: 'ลักษณะตัวอักษรชื่อ', hint: 'เช่น huge elegant serif masthead' },
  { key: 'titlePos', label: 'ตำแหน่งชื่อ', hint: 'เช่น across the top' },
  { key: 'tagline', label: 'คำโปรย', hint: 'ไม่บังคับ' },
  { key: 'taglinePos', label: 'ตำแหน่งคำโปรย', hint: 'เช่น bottom left' },
  { key: 'female', label: 'ชุดผู้หญิง', hint: 'เช่น a black satin blazer dress with gold jewellery', required: true },
  { key: 'male', label: 'ชุดผู้ชาย', hint: 'เช่น a black tuxedo with an open collar', required: true },
  { key: 'hairFemale', label: 'ทรงผมผู้หญิง', hint: 'เช่น sleek glossy waves swept to one side', required: true },
  { key: 'hairMale', label: 'ทรงผมผู้ชาย', hint: 'เช่น a short textured quiff', required: true },
  { key: 'pose', label: 'ท่าโพส', hint: 'ไม่บังคับ' },
  { key: 'framing', label: 'การจัดเฟรม', hint: 'ไม่บังคับ เช่น framed from the waist up' },
  { key: 'camera', label: 'กล้อง/เลนส์', hint: 'ไม่บังคับ เช่น 85mm portrait lens, shallow depth of field' }
];

export function AiSceneEditor({
  id,
  initialSpec,
  files,
  draftVersion,
  hasPublished,
  issues,
  uploaded = true
}: {
  /** Uploaded scenes carry their own brief (built-in ones keep theirs in code). */
  uploaded?: boolean;
  id: string;
  initialSpec: AiSceneSpec;
  files: Partial<Record<'plate' | 'female' | 'male', EditorFile>>;
  draftVersion: number | null;
  hasPublished: boolean;
  issues: string[];
}) {
  const router = useRouter();
  const [spec, setSpec] = useState<AiSceneSpec>({ ...initialSpec, category: initialSpec.category ?? 'special', subName: initialSpec.subName ?? '' });
  const brief = spec.brief ?? EMPTY_BRIEF;
  const setBrief = (patch: Partial<AiSceneBrief>) => setSpec({ ...spec, brief: { ...brief, ...patch } });
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
          <h3 className="mb-3 font-semibold text-ink-900">ที่ตู้</h3>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm text-ink-700">
              หมวดในเมนู
              <select value={spec.category} onChange={(e) => setSpec({ ...spec, category: e.target.value })} className="h-10 rounded-lg border border-ink-200 px-2">
                {AI_SCENE_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm text-ink-700">
              บรรทัดรอง (ไม่บังคับ)
              <input value={spec.subName} maxLength={80} onChange={(e) => setSpec({ ...spec, subName: e.target.value })} placeholder="เช่น ชื่อภาษาไทย" className="h-10 rounded-lg border border-ink-200 px-2" />
            </label>
          </div>
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
        {uploaded ? (
          <section className="rounded-card border border-ink-200 bg-surface p-4 shadow-card">
            <h3 className="font-semibold text-ink-900">บรีฟสำหรับ AI</h3>
            <p className="mb-3 text-xs text-ink-500">AI ใช้บรีฟนี้วาดลูกค้าลงในฉาก (เขียนเป็นภาษาอังกฤษ ยกเว้นชื่อภาษาไทย) • ช่องที่มี * ต้องกรอก</p>
            <div className="mb-3 flex flex-wrap gap-4 text-sm text-ink-700">
              <label className="flex items-center gap-2">
                รูปแบบ
                <select value={brief.style} onChange={(e) => setBrief({ style: e.target.value as AiSceneBrief['style'] })} className="h-9 rounded-lg border border-ink-200 px-2">
                  <option value="poster">โปสเตอร์ (คนอยู่กลางภาพ)</option>
                  <option value="postcard">โปสการ์ดท่องเที่ยว (เห็นสถานที่ด้านหลัง)</option>
                </select>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={brief.thaiText} onChange={(e) => setBrief({ thaiText: e.target.checked })} className="size-4 accent-primary-600" />
                ชื่อเป็นภาษาไทย
              </label>
            </div>
            <div className="flex flex-col gap-3">
              {BRIEF_FIELDS.map((f) => (
                <label key={f.key} className="flex flex-col gap-1 text-sm text-ink-700">
                  <span>
                    {f.label}
                    {f.required ? <span className="text-danger-600"> *</span> : null}
                  </span>
                  <textarea
                    value={brief[f.key]}
                    onChange={(e) => setBrief({ [f.key]: e.target.value })}
                    rows={f.rows ?? 1}
                    maxLength={600}
                    placeholder={f.hint}
                    className="w-full resize-y rounded-lg border border-ink-200 px-3 py-2 text-sm"
                  />
                </label>
              ))}
            </div>
          </section>
        ) : null}
        <section className="rounded-card border border-ink-200 bg-surface p-4 shadow-card">
          <h3 className="mb-2 font-semibold text-ink-900">บันทึก / โจทย์ของฉาก</h3>
          <textarea
            value={spec.prompt}
            onChange={(e) => setSpec({ ...spec, prompt: e.target.value })}
            rows={4}
            maxLength={4000}
            placeholder="ไม่บังคับ เช่น โจทย์จากลูกค้า หรือข้อควรระวัง"
            className="w-full rounded-lg border border-ink-200 p-3 text-sm"
          />
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
