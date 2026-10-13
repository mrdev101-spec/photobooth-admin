import 'server-only';
import { and, inArray, lt } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { kioskCommands, loginChallenges, rateLimits, trustedDevices, userSessions } from '@/server/db/schema';
import { sweepAiJobs } from '@/server/services/ai-jobs';
import { fillMissingFees, sweepExpiredPayments } from '@/server/services/payments';
import { sweepPhoneUploads } from '@/server/services/phone-uploads';

const DAY = 86_400_000;

/**
 * Periodic clean-up (the housekeeping cron). The sweeps also run when kiosks call the related
 * APIs, but a quiet shop would otherwise keep stuck AI jobs, payable QR codes and held payments.
 * Each step runs even if an earlier one fails; the result says what happened.
 */
export async function runHousekeeping() {
  const out: Record<string, string | number> = {};
  const step = async (name: string, fn: () => Promise<unknown>) => {
    try {
      const r = await fn();
      out[name] = typeof r === 'number' ? r : 'ok';
    } catch (err) {
      console.error('[housekeeping]', name, err);
      out[name] = 'failed';
    }
  };
  const affected = (r: unknown) => (Array.isArray(r) && r[0] && typeof r[0] === 'object' && 'affectedRows' in r[0] ? Number((r[0] as { affectedRows: number }).affectedRows) : 0);

  await step('aiJobs', () => sweepAiJobs());
  await step('expiredPayments', () => sweepExpiredPayments(100));
  await step('stripeFees', () => fillMissingFees(50));
  await step('phoneUploads', () => sweepPhoneUploads());
  await step('sessions', async () => affected(await db().delete(userSessions).where(lt(userSessions.expiresAt, new Date(Date.now() - DAY)))));
  await step('loginChallenges', async () => affected(await db().delete(loginChallenges).where(lt(loginChallenges.expiresAt, new Date()))));
  await step('trustedDevices', async () => affected(await db().delete(trustedDevices).where(lt(trustedDevices.expiresAt, new Date()))));
  await step('rateLimits', async () => affected(await db().delete(rateLimits).where(lt(rateLimits.windowStart, new Date(Date.now() - DAY)))));
  await step('kioskCommands', async () =>
    affected(await db().delete(kioskCommands).where(and(inArray(kioskCommands.status, ['done', 'failed']), lt(kioskCommands.createdAt, new Date(Date.now() - 30 * DAY)))))
  );
  return out;
}
