'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import clsx from 'clsx';
import { Check, ImageIcon, Lock } from 'lucide-react';
import { buttonClass } from '@/components/ui';
import { TemplatePreview } from '@/components/template-preview';
import type { CatalogItem, TemplateKind } from '@/lib/template-visibility';
import { saveVisibilityAction } from './actions';

/**
 * Show / hide templates of one category on a kiosk (or every kiosk). Owners cannot add or
 * delete templates — those come from the platform (docs §18.2).
 */
export function TemplateGallery({
  orgSlug,
  kind,
  items,
  kioskRowId,
  allKioskIds,
  locked,
  supportsUploaded
}: {
  orgSlug: string;
  kind: TemplateKind;
  items: (CatalogItem & { shown: boolean; uploaded?: boolean })[];
  kioskRowId: string;
  allKioskIds: string[];
  locked: boolean;
  supportsUploaded: boolean;
}) {
  const router = useRouter();
  const initial = useMemo(() => new Set(items.filter((i) => i.shown).map((i) => i.id)), [items]);
  const [shown, setShown] = useState<Set<string>>(initial);
  const [allKiosks, setAllKiosks] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  const dirty = shown.size !== initial.size || [...shown].some((id) => !initial.has(id)) || allKiosks;

  const toggle = (id: string) => {
    if (locked) return;
    setShown((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
    setResult(null);
  };

  const save = () =>
    start(async () => {
      const r = await saveVisibilityAction(orgSlug, allKiosks ? allKioskIds : [kioskRowId], kind, [...shown]);
      setResult(r);
      if (r.ok) router.refresh();
    });

  return (
    <div className="flex flex-col gap-4 pb-24">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-ink-600">
          แสดง <b className="text-ink-900">{shown.size}</b> จาก {items.length} แบบ
        </span>
        {!locked ? (
          <>
            <button type="button" className={buttonClass('ghost', 'sm')} onClick={() => setShown(new Set(items.map((i) => i.id)))}>
              แสดงทั้งหมด
            </button>
            <button type="button" className={buttonClass('ghost', 'sm')} onClick={() => setShown(new Set())}>
              ซ่อนทั้งหมด
            </button>
          </>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-ink-500">
            <Lock className="size-4" aria-hidden />
            หมวดนี้จัดการโดยผู้ให้บริการ
          </span>
        )}
      </div>

      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {items.map((it) => {
          const on = shown.has(it.id);
          return (
            <li key={it.id}>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                disabled={locked}
                onClick={() => toggle(it.id)}
                className={clsx(
                  'group relative flex h-full w-full flex-col overflow-hidden rounded-card border bg-surface text-left shadow-card transition-colors',
                  on ? 'border-primary-600 ring-1 ring-primary-600' : 'border-ink-200 hover:border-ink-300',
                  locked && 'cursor-default'
                )}
              >
                <span className="relative">
                  <TemplatePreview kind={kind} src={it.image} className={clsx(!on && 'opacity-50 grayscale')} />
                  <span className={clsx('absolute top-2 right-2 flex size-7 items-center justify-center rounded-full border-2', on ? 'border-primary-600 bg-primary-600 text-white' : 'border-ink-300 bg-surface/90 text-transparent')}>
                    <Check className="size-4" aria-hidden />
                  </span>
                </span>
                <span className="flex flex-1 flex-col gap-0.5 p-3">
                  <span className="font-semibold text-ink-900">{it.name}</span>
                  {it.tag ? <span className="text-xs font-medium text-primary-700">{it.tag}</span> : null}
                  {it.uploaded ? (
                    <span className={clsx('text-xs font-medium', supportsUploaded ? 'text-violet-700' : 'text-warning-700')}>
                      {supportsUploaded ? 'ใหม่จากส่วนกลาง' : 'ใหม่จากส่วนกลาง • ตู้นี้ต้องอัปเดตโปรแกรมก่อนจึงจะแสดง'}
                    </span>
                  ) : null}
                  <span className="line-clamp-2 text-sm text-ink-500">{it.desc}</span>
                  <span className={clsx('mt-auto pt-2 text-xs font-semibold', on ? 'text-success-700' : 'text-ink-400')}>{on ? 'แสดงที่ตู้' : 'ซ่อน'}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {!locked ? (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-ink-200 bg-surface/95 px-4 py-3 backdrop-blur lg:left-64">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-ink-700">
              <input type="checkbox" checked={allKiosks} onChange={(e) => setAllKiosks(e.target.checked)} className="size-4 accent-primary-600" />
              ใช้กับทุกตู้ ({allKioskIds.length} ตู้)
            </label>
            <button type="button" onClick={save} disabled={pending || !dirty || shown.size === 0} className={buttonClass()}>
              <ImageIcon className="size-5" aria-hidden />
              {pending ? 'กำลังบันทึก…' : 'บันทึกและส่งไปตู้'}
            </button>
            {shown.size === 0 ? <span className="text-sm text-danger-600">ต้องเปิดไว้อย่างน้อย 1 แบบ</span> : null}
            {result ? (
              <span role={result.ok ? 'status' : 'alert'} className={clsx('text-sm font-medium', result.ok ? 'text-success-700' : 'text-danger-600')}>
                {result.message}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
