import { eq, sql } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { rateLimits } from '@/server/db/schema';

/**
 * Fixed-window counter in MariaDB (no Redis needed at our scale). Returns true while the
 * caller is within `limit` hits per `windowSec`.
 * In ON DUPLICATE KEY UPDATE, assignments run left to right, so `count` is computed from the
 * old `window_start` before `window_start` itself is reset.
 */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<boolean> {
  await db().execute(sql`
    INSERT INTO rate_limits (\`key\`, window_start, \`count\`) VALUES (${key}, NOW(3), 1)
    ON DUPLICATE KEY UPDATE
      \`count\` = IF(window_start < NOW(3) - INTERVAL ${windowSec} SECOND, 1, \`count\` + 1),
      window_start = IF(window_start < NOW(3) - INTERVAL ${windowSec} SECOND, NOW(3), window_start)
  `);
  const row = (await db().select({ count: rateLimits.count }).from(rateLimits).where(eq(rateLimits.key, key)).limit(1))[0];
  return (row?.count ?? 0) <= limit;
}
