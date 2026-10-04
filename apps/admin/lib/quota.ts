/** Quotas set by the platform: `null` = unlimited. */

export function isFull(used: number, quota: number | null | undefined): boolean {
  return quota != null && used >= quota;
}

/** "2 / 5" or "2 / ไม่จำกัด". */
export function formatQuota(used: number, quota: number | null | undefined): string {
  return `${used.toLocaleString('th-TH')} / ${quota == null ? 'ไม่จำกัด' : quota.toLocaleString('th-TH')}`;
}
