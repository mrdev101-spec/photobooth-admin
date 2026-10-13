import type { Metadata } from 'next';
import { orgContextForPlatform, requirePlatform } from '@/server/auth/context';
import { canPlatform } from '@/server/auth/rbac';
import { getPlatformKiosk } from '@/server/services/kiosks';
import { getConfigEditor } from '@/server/services/kiosk-config';
import { hasStorage } from '@/server/services/storage';
import { editorSources } from '@/server/services/config-presets';
import { resolvePermissions } from '@/lib/config-permissions';
import { formatDateTime, formatRelative } from '@/lib/format';
import { Notice } from '@/components/ui';
import { ConfigEditor } from '@/app/o/[orgSlug]/(admin)/kiosks/[id]/config/config-editor';
import { editorCatalog } from '@/app/o/[orgSlug]/(admin)/kiosks/[id]/config/editor-catalog';

export const metadata: Metadata = { title: 'การตั้งค่าตู้' };

/** The kiosk's settings, edited from the Platform (the same editor as the shop's, without leaving). */
export default async function PlatformKioskSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const platform = await requirePlatform();
  const { org } = await getPlatformKiosk(id);
  const ctx = await orgContextForPlatform(platform, org.id);
  const { kiosk, current, lastAck } = await getConfigEditor(ctx, id);

  if (!current) {
    return <Notice tone="info">ตู้นี้ยังไม่เคยลงทะเบียน การตั้งค่าจะถูกสร้างเมื่อลงทะเบียนที่ตู้ครั้งแรก (จากค่ากลางของ{org.kind === 'stock' ? 'คลังตู้' : `ร้าน ${org.name}`})</Notice>;
  }
  const canEdit = canPlatform(platform.user.platformRole, 'platform.org.manage') && kiosk.status !== 'revoked' && !kiosk.archivedAt;
  const { adminPin, ...editable } = current.settings;
  const applied = kiosk.appliedRevision ?? 0;

  return (
    <>
      <div className="mb-6 flex flex-col gap-3">
        <p className="text-sm text-ink-500">
          revision {current.revision} • บันทึกเมื่อ {formatDateTime(current.createdAt)}
          {org.kind === 'stock' ? ' • ตู้ในคลัง: ค่าที่ตั้งตอนนี้ใช้ระหว่างทดสอบ เมื่อมอบให้ร้านจะเริ่มจากค่ากลางของร้าน' : ` • ร้าน ${org.name} เห็นและแก้ค่านี้ได้ตามสิทธิ์ของร้าน`}
        </p>
        {kiosk.configError && kiosk.configError.revision >= applied ? (
          <Notice tone="danger">
            ตู้ไม่รับการตั้งค่า revision {kiosk.configError.revision}: {kiosk.configError.message || 'ไม่ระบุสาเหตุ'} — ตู้ยังใช้ค่าชุดเดิม (revision {applied || '—'})
          </Notice>
        ) : kiosk.status === 'active' && applied < current.revision ? (
          <Notice tone="warn">
            รอตู้ใช้ revision {current.revision} (ตู้ใช้ revision {applied || '—'} อยู่) ตู้จะดึงค่าใหม่ภายใน 1 นาที และใช้เมื่อกลับถึงหน้าแรก
          </Notice>
        ) : kiosk.status === 'active' ? (
          <Notice tone="ok">ตู้ใช้การตั้งค่าล่าสุดแล้ว{lastAck?.status === 'applied' ? ` (${formatRelative(lastAck.receivedAt)})` : ''}</Notice>
        ) : null}
        {kiosk.emergency ? <Notice tone="warn">ตู้เปิดโหมดฉุกเฉินอยู่ การตั้งค่าใหม่จะรอจนกว่าเจ้าหน้าที่กด &quot;กลับไปใช้ค่าจาก Admin&quot; ที่ตู้</Notice> : null}
        {!canEdit ? <Notice tone="info">ดูได้อย่างเดียว{kiosk.archivedAt ? ' (ตู้ถูกยกเลิกแล้ว)' : kiosk.status === 'revoked' ? ' (ตู้ถูกรีเซ็ตและล็อกอยู่)' : ''}</Notice> : null}
      </div>

      <ConfigEditor
        orgSlug={org.slug}
        kioskRowId={kiosk.id}
        baseRevision={current.revision}
        initial={editable}
        hasPin={!!adminPin}
        canEdit={canEdit}
        livePaymentsAllowed={org.livePaymentsAllowed}
        storageConfigured={await hasStorage(org.id)}
        permissions={resolvePermissions(org.configPermissions)}
        isPlatform
        catalog={await editorCatalog(org.id)}
        sources={(await editorSources(ctx)).map((x) => ({ id: x.source.kind === 'event' ? x.source.id : null, label: x.label, settings: x.settings, hasPin: x.hasPin }))}
        initialEventId={kiosk.eventId}
        initialOwn={kiosk.ownSections}
      />
    </>
  );
}
