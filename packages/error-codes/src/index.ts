import kioskCodes from '../kiosk-codes.json';
import adminCodes from '../admin-codes.json';

/**
 * Error codes shared with the kiosk. `kiosk-codes.json` is a copy of the kiosk's
 * `aiErrorCodes.json` (source of truth on the kiosk side); `admin-codes.json` holds the
 * codes the Admin API returns (group AD, plus PU0003) and must be added to the kiosk file too.
 */
export interface ErrorCodeInfo {
  code: string;
  group: string;
  title: string;
  cause: string;
  fix: string;
  retryable: boolean;
}

type RawCodes = Record<string, Omit<ErrorCodeInfo, 'code'>>;

const all: Record<string, ErrorCodeInfo> = {};
for (const [code, info] of Object.entries({ ...(kioskCodes as RawCodes), ...(adminCodes as RawCodes) })) {
  all[code] = { code, ...info };
}

export const ERROR_CODES: Readonly<Record<string, ErrorCodeInfo>> = all;

export function describeError(code: string | null | undefined): ErrorCodeInfo | undefined {
  return code ? all[code.toUpperCase()] : undefined;
}

export function listErrorCodes(): ErrorCodeInfo[] {
  return Object.values(all).sort((a, b) => a.code.localeCompare(b.code));
}
