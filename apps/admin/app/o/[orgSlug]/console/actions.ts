'use server';

import { z } from 'zod';
import { requireOrg } from '@/server/auth/context';
import { QuickSaveInput, quickSettingsView, saveQuickSettings } from '@/server/services/quick-settings';
import { AppError } from '@/server/lib/errors';
import { editorCatalog } from '../kiosks/[id]/config/editor-catalog';

export type QuickView = Awaited<ReturnType<typeof quickSettingsView>> & { catalog: { photo: { id: string; name: string; image?: string }[]; badge: { id: string; name: string; image?: string }[] } };

export async function quickSettingsViewAction(orgSlug: string, kioskRowId: string): Promise<{ ok: true; view: QuickView } | { ok: false; message: string }> {
  try {
    const ctx = await requireOrg(orgSlug, 'config.edit');
    const [view, catalog] = await Promise.all([quickSettingsView(ctx, kioskRowId), editorCatalog(ctx.org.id)]);
    return { ok: true, view: { ...view, catalog: { photo: catalog.photo, badge: catalog.badge } } };
  } catch (err) {
    return { ok: false, message: err instanceof AppError ? err.message : 'โหลดการตั้งค่าไม่ได้' };
  }
}

export async function saveQuickSettingsAction(orgSlug: string, raw: unknown): Promise<{ ok: boolean; message: string }> {
  try {
    const ctx = await requireOrg(orgSlug, 'config.edit');
    const r = await saveQuickSettings(ctx, QuickSaveInput.parse(raw));
    const parts = [
      r.source ? `บันทึกที่${r.source.label} • ส่งค่าใหม่ไป ${r.source.kiosks} ตู้` : '',
      r.kiosk ? 'บันทึกเฉพาะตู้นี้' : ''
    ].filter(Boolean);
    return { ok: true, message: parts.length ? `${parts.join(' และ ')} • ตู้ใช้ค่าใหม่เมื่อกลับหน้าแรก` : 'ไม่มีอะไรเปลี่ยน' };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, message: err.message };
    if (err instanceof z.ZodError) return { ok: false, message: err.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง' };
    console.error(err);
    return { ok: false, message: 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง' };
  }
}
