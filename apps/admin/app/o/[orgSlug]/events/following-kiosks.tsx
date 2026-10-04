import Link from 'next/link';
import { MonitorSmartphone } from 'lucide-react';
import { Card } from '@/components/ui';
import { CONFIG_SECTIONS } from '@/lib/config-permissions';
import { ALWAYS_OWN, normalizeOwnSections } from '@/lib/config-layers';

/** Kiosks that follow a layer, with the sections each one sets itself. */
export function FollowingKiosks({ orgSlug, kiosks, empty }: { orgSlug: string; kiosks: { id: string; name: string; ownSections: string[] | null }[]; empty: string }) {
  return (
    <Card title={`ตู้ที่ใช้ค่านี้ (${kiosks.length})`} icon={<MonitorSmartphone aria-hidden />} className="mb-6 max-w-5xl">
      {kiosks.length ? (
        <ul className="flex flex-col divide-y divide-ink-100">
          {kiosks.map((k) => {
            const own = normalizeOwnSections(k.ownSections).filter((id) => !ALWAYS_OWN.includes(id));
            return (
              <li key={k.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                <Link href={`/o/${orgSlug}/kiosks/${k.id}/config`} className="font-medium text-primary-700 hover:underline">
                  {k.name}
                </Link>
                <span className="text-sm text-ink-500">
                  {k.ownSections == null
                    ? 'ตั้งค่าเองทุกหมวด (ตู้เดิมก่อนมีค่ากลาง) — เลือก "ตาม" ได้ในหน้าการตั้งค่าของตู้'
                    : own.length
                      ? `ตั้งเองบางหมวด: ${own.map((id) => CONFIG_SECTIONS.find((s) => s.id === id)?.label ?? id).join(', ')}`
                      : 'ตามทุกหมวด'}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-ink-500">{empty}</p>
      )}
    </Card>
  );
}
