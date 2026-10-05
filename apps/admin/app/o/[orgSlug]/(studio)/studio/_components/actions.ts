'use server';

import { z } from 'zod';
import { requireOrg } from '@/server/auth/context';
import { QuickPatchSchema, QuickSaveInput, quickSettingsView, releaseKioskSections, saveQuickSettings, saveSourceQuick, sectionLabels } from '@/server/services/quick-settings';
import { studioEvent } from '@/server/services/event-console';
import { AppError } from '@/server/lib/errors';
import { editorCatalog } from '@/app/o/[orgSlug]/(admin)/kiosks/[id]/config/editor-catalog';

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
      r.released.length ? `ตู้นี้กลับมาใช้ค่าของ${r.source?.label ?? 'งาน'}แล้ว (${sectionLabels(r.released).join(', ')})` : '',
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

/** ตั้งค่างาน / Template ของงาน: a kiosk that sets sections itself follows the event again. */
export async function releaseKioskAction(orgSlug: string, kioskRowId: string, how: 'adopt' | 'follow'): Promise<{ ok: boolean; message: string }> {
  try {
    const ctx = await requireOrg(orgSlug, 'config.edit');
    const r = await releaseKioskSections(ctx, kioskRowId, how === 'adopt' ? 'adopt' : 'follow');
    if (!r.sections.length) return { ok: false, message: 'ไม่มีหมวดที่เปลี่ยนได้ (หมวดที่เหลือผู้ให้บริการกำหนด)' };
    const kept = r.kept.length ? ` • ตู้ยังตั้งเอง: ${sectionLabels(r.kept).join(', ')} (ผู้ให้บริการกำหนด หรือตู้มีรหัสผู้ดูแลของตัวเอง)` : '';
    return {
      ok: true,
      message:
        how === 'adopt'
          ? `ค่าของตู้กลายเป็นค่าของ${r.label}แล้ว (${r.sections.length} หมวด) • ตู้ใช้ค่าเดิมต่อ และต่อไปแก้ที่หน้านี้แล้วไปถึงตู้${kept}`
          : `ตู้กลับมาใช้ค่าของ${r.label}แล้ว (${r.sections.length} หมวด)${kept}`
    };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, message: err.message };
    console.error(err);
    return { ok: false, message: 'ทำไม่สำเร็จ ลองใหม่อีกครั้ง' };
  }
}

/** Event Studio › ตั้งค่างาน: the event's own settings (or ค่ากลาง for "all kiosks"). */
export async function saveEventQuickAction(orgSlug: string, eventKey: string, raw: unknown): Promise<{ ok: boolean; message: string }> {
  try {
    const ctx = await requireOrg(orgSlug, 'config.edit');
    const ev = await studioEvent(ctx, eventKey);
    if (!ev) return { ok: false, message: 'ไม่พบงานนี้ หรือปิดงานไปแล้ว' };
    const r = await saveSourceQuick(ctx, ev.id, QuickPatchSchema.parse(raw));
    return { ok: true, message: r.label ? `บันทึกที่${r.label}แล้ว • ส่งค่าใหม่ไป ${r.kiosks} ตู้ (ตู้ใช้ค่าใหม่เมื่อกลับหน้าแรก)` : 'ไม่มีอะไรเปลี่ยน' };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, message: err.message };
    if (err instanceof z.ZodError) return { ok: false, message: err.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง' };
    console.error(err);
    return { ok: false, message: 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง' };
  }
}
