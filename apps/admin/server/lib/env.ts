/**
 * Endpoint overrides (a proxy, or a stand-in provider in tests). In production only an https
 * URL is accepted, so a stray setting can never send secret keys over plain HTTP.
 */
export function endpointOverride(name: string, fallback: string): string {
  const v = process.env[name]?.trim();
  if (!v) return fallback;
  if (process.env.NODE_ENV === 'production' && !v.startsWith('https://')) {
    console.warn(`[env] ${name} ignored in production (must be an https URL)`);
    return fallback;
  }
  return v.replace(/\/+$/, '');
}
