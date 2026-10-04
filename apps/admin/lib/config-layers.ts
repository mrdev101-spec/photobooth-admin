/**
 * Settings layers (decision 2026-10-04): ค่ากลาง (customer defaults) → งาน (event preset) → ตู้.
 * A kiosk follows its event (or the defaults when it has none) section by section, except the
 * sections it sets itself (`ownSections`). The kiosk still receives one full settings document
 * per revision; this module only decides which layer each section comes from. Pure module:
 * used by the config editor and by the server.
 */
import type { KioskSettings } from '@photobooth/contracts';
import { CONFIG_SECTIONS, type ConfigSectionId } from './config-permissions';

/** The kiosk's name and location are always its own. */
export const ALWAYS_OWN: readonly ConfigSectionId[] = ['identity'];

/** Sections a new kiosk sets itself; everything else follows its event / the defaults. */
export const NEW_KIOSK_OWN_SECTIONS: ConfigSectionId[] = ['identity'];

const SECTION_IDS = new Set<string>(CONFIG_SECTIONS.map((s) => s.id));

/** Cleaned list; `null` (kiosks from before presets) means every section is the kiosk's own. */
export function normalizeOwnSections(own: readonly string[] | null | undefined): ConfigSectionId[] {
  if (own == null) return CONFIG_SECTIONS.map((s) => s.id);
  return [...new Set([...ALWAYS_OWN, ...own.filter((id) => SECTION_IDS.has(id))])] as ConfigSectionId[];
}

/**
 * The kiosk's settings: its own values for `ownSections`, the source's (event or defaults) for
 * the rest. Every settings path belongs to exactly one section (config-permissions.ts).
 */
export function composeSettings(own: KioskSettings, source: KioskSettings, ownSections: readonly string[] | null | undefined): KioskSettings {
  const keep = new Set<string>(normalizeOwnSections(ownSections));
  const out: Record<string, unknown> = { ...own };
  for (const section of CONFIG_SECTIONS) {
    if (keep.has(section.id)) continue;
    for (const path of section.paths) {
      const value = (source as Record<string, unknown>)[path];
      out[path] = value === undefined ? undefined : structuredClone(value);
    }
  }
  return out as KioskSettings;
}

export type SettingsSource = { kind: 'defaults' } | { kind: 'event'; id: string; name: string };

export const sourceLabel = (s: SettingsSource) => (s.kind === 'event' ? `งาน "${s.name}"` : 'ค่ากลาง');
