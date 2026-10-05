'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { buttonClass } from '@/components/ui';
import { CONFIG_SECTIONS } from '@/lib/config-permissions';
import { releaseKioskAction, saveEventQuickAction } from './actions';
import { QUICK_SECTION, QuickFields, changedParts, patchOf, type CatalogEntry, type QuickPart, type QuickValues } from './quick-settings';

const LABEL = Object.fromEntries(CONFIG_SECTIONS.map((s) => [s.id, s.label]));

/**
 * Kiosks of this event that set sections themselves: what this page can't change on them, and
 * the two ways back (keep the kiosk's look by making it the event's, or take the event's).
 */
function OwnersBanner({ orgSlug, owners, parts, sourceLabel }: { orgSlug: string; owners: { id: string; name: string; sections: string[] }[]; parts?: QuickPart[]; sourceLabel: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [ask, setAsk] = useState<{ id: string; how: 'adopt' | 'follow' } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const onPage = new Set((parts ?? (Object.keys(QUICK_SECTION) as QuickPart[])).map((p) => QUICK_SECTION[p]));
  // Only kiosks that keep something this page edits
  const list = owners.filter((k) => k.sections.some((id) => onPage.has(id)));
  if (!list.length && !msg) return null;
  const run = (id: string, how: 'adopt' | 'follow') =>
    start(async () => {
      const r = await releaseKioskAction(orgSlug, id, how);
      setMsg({ ok: r.ok, text: r.message });
      setAsk(null);
      if (r.ok) router.refresh();
    });
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-warning-200 bg-warning-50 p-4 text-sm text-warning-900" role="region" aria-label="ตู้ที่ตั้งค่าเอง">
      {list.length ? (
        <p>
          <b>{list.length} ตู้ตั้งค่าบางหมวดเอง</b> ค่าที่บันทึกในหน้านี้จะไม่ไปถึงหมวดเหล่านั้นของตู้ จนกว่าจะให้ตู้กลับมาใช้ค่าของ{sourceLabel}
        </p>
      ) : null}
      {list.map((k) => (
        <div key={k.id} className="flex flex-col gap-2 rounded-md bg-surface p-3 text-ink-800">
          <div className="min-w-0">
            <span className="font-semibold text-ink-900">{k.name}</span>
            <span className="text-ink-600"> ตั้งเอง {k.sections.length} หมวด: </span>
            <span className="text-ink-600">
              {k.sections.map((id, i) => (
                <span key={id} className={onPage.has(id) ? 'font-medium text-warning-800' : undefined}>
                  {i ? ', ' : ''}
                  {LABEL[id] ?? id}
                </span>
              ))}
            </span>
          </div>
          {ask?.id === k.id ? (
            <div className="flex flex-col gap-2 rounded-md bg-primary-50 p-3">
              <p className="text-ink-900">
                {ask.how === 'adopt'
                  ? `ค่าที่ตู้ ${k.name} ใช้อยู่จะกลายเป็นค่าของ${sourceLabel} ทุกตู้ที่ใช้${sourceLabel}จะได้ค่านี้ด้วย ตู้นี้หน้าตาและราคาเหมือนเดิม`
                  : `ตู้ ${k.name} จะทิ้งค่าของตัวเองแล้วใช้ค่าของ${sourceLabel}แทน (หน้าตา ราคา กรอบ อาจเปลี่ยน)`}
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={pending} onClick={() => run(k.id, ask.how)} className={buttonClass('primary', 'sm')}>
                  {pending ? 'กำลังส่ง…' : 'ยืนยัน'}
                </button>
                <button type="button" disabled={pending} onClick={() => setAsk(null)} className={buttonClass('ghost', 'sm')}>
                  ยกเลิก
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setAsk({ id: k.id, how: 'adopt' })} className={buttonClass('outline', 'sm')}>
                ใช้ค่าของตู้นี้เป็นค่าของงาน
              </button>
              <button type="button" onClick={() => setAsk({ id: k.id, how: 'follow' })} className={buttonClass('ghost', 'sm')}>
                ให้ตู้ใช้ค่าของงาน
              </button>
            </div>
          )}
        </div>
      ))}
      {msg ? <p className={msg.ok ? 'font-medium text-success-700' : 'font-medium text-danger-600'} role="status">{msg.text}</p> : null}
    </div>
  );
}

/** ตั้งค่างาน / Template ของงาน: the event's own settings (every kiosk of the event follows them). */
export function EventSettingsForm({
  orgSlug,
  eventKey,
  values,
  locked,
  ownCount,
  source,
  catalog,
  canSource,
  parts,
  owners = []
}: {
  orgSlug: string;
  eventKey: string;
  values: QuickValues;
  locked: string[];
  /** Kiosks that set a section themselves (they keep their value). */
  ownCount: Record<string, number>;
  source: { label: string; kiosks: number };
  catalog: { photo: CatalogEntry[]; badge: CatalogEntry[] };
  canSource: boolean;
  parts?: QuickPart[];
  /** Kiosks of this event that set sections themselves (they don't follow this page). */
  owners?: { id: string; name: string; sections: string[] }[];
}) {
  const router = useRouter();
  const [base, setBase] = useState(values);
  const [v, setV] = useState(values);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const changed = useMemo(() => changedParts(v, base), [v, base]);

  const save = () =>
    start(async () => {
      const r = await saveEventQuickAction(orgSlug, eventKey, patchOf(v, changed));
      setMsg({ ok: r.ok, text: r.message });
      if (r.ok) {
        setBase(v);
        router.refresh();
      }
    });

  if (!canSource) return <p className="text-sm text-ink-500">ตั้งค่าทั้งงานได้เฉพาะผู้ที่ดูแลทุกสาขา • ใช้ &quot;ตั้งค่าด่วน (ตู้นี้)&quot; ที่หน้าตู้แทน</p>;

  return (
    <div className="flex max-w-3xl flex-col gap-4 pb-20">
      <OwnersBanner orgSlug={orgSlug} owners={owners} parts={parts} sourceLabel={source.label} />
      <QuickFields
        v={v}
        onChange={setV}
        catalog={catalog}
        parts={parts}
        locked={(p) => locked.includes(QUICK_SECTION[p])}
        note={(p) => (ownCount[QUICK_SECTION[p]] ? `${ownCount[QUICK_SECTION[p]]} ตู้ตั้งหมวดนี้เอง จะไม่เปลี่ยน` : undefined)}
      />
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-ink-200 bg-surface/95 px-4 py-3 backdrop-blur lg:left-72">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3">
          <span className={msg ? (msg.ok ? 'text-sm font-medium text-success-700' : 'text-sm font-medium text-danger-600') : 'text-sm text-ink-500'} role={msg ? 'status' : undefined}>
            {msg ? msg.text : changed.length ? `แก้ ${changed.length} หมวด • บันทึกแล้วใช้กับทุกตู้ที่ใช้${source.label} (${source.kiosks} ตู้)` : `ค่าของ${source.label} • ตู้ใช้ค่าใหม่เมื่อกลับหน้าแรก`}
          </span>
          <div className="flex gap-2">
            {changed.length ? (
              <button type="button" disabled={pending} onClick={() => setV(base)} className={buttonClass('ghost', 'md')}>
                ยกเลิก
              </button>
            ) : null}
            <button type="button" disabled={!changed.length || pending} onClick={save} className={buttonClass('primary', 'md')}>
              {pending ? 'กำลังบันทึก…' : 'บันทึกและส่งไปตู้'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
