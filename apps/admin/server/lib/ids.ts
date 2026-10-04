import { ulid } from 'ulid';

export type IdPrefix = 'org' | 'usr' | 'ses' | 'brn' | 'aud' | 'ksk' | 'kpc' | 'ktk' | 'ack' | 'ord' | 'ofl' | 'tpv';

/** Sortable, prefixed ids, e.g. `org_01J9Z3…` (fits VARCHAR(32)). */
export function newId(prefix: IdPrefix): string {
  return `${prefix}_${ulid()}`;
}

const SLUG_MAX = 48;

/** URL slug for an organization name; falls back to a random suffix for non-Latin names. */
export function slugify(name: string): string {
  const base = name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, '');
  return base || `org-${ulid().slice(-6).toLowerCase()}`;
}
