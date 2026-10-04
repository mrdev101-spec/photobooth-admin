import 'server-only';
import { and, eq } from 'drizzle-orm';
import { defaultKioskSettings, withSettingsDefaults, type KioskSettings } from '@photobooth/contracts';
import { db } from '@/server/db/client';
import { configEvents, orgConfigDefaults } from '@/server/db/schema';
import type { SettingsSource } from '@/lib/config-layers';

/** The customer's defaults (ค่ากลาง); the kiosk app's own defaults until they are saved once. */
export async function orgDefaults(orgId: string): Promise<{ settings: KioskSettings; saved: boolean; updatedAt: Date | null }> {
  const row = (await db().select().from(orgConfigDefaults).where(eq(orgConfigDefaults.orgId, orgId)).limit(1))[0];
  return row ? { settings: withSettingsDefaults(row.settings), saved: true, updatedAt: row.updatedAt } : { settings: defaultKioskSettings(), saved: false, updatedAt: null };
}

/** What a kiosk follows: its event while the event is open, otherwise the defaults. */
export async function sourceFor(orgId: string, eventId: string | null): Promise<{ source: SettingsSource; settings: KioskSettings }> {
  if (eventId) {
    const ev = (await db().select().from(configEvents).where(and(eq(configEvents.id, eventId), eq(configEvents.orgId, orgId))).limit(1))[0];
    if (ev && ev.isActive) return { source: { kind: 'event', id: ev.id, name: ev.name }, settings: withSettingsDefaults(ev.settings) };
  }
  return { source: { kind: 'defaults' }, settings: (await orgDefaults(orgId)).settings };
}
