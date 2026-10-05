import 'server-only';
import { and, eq, inArray, lt } from 'drizzle-orm';
import type { CommandResultSchema, KioskCommand, KioskWaitResponse } from '@photobooth/contracts';
import type { z } from 'zod';
import { db } from '@/server/db/client';
import { kioskCommands, kiosks } from '@/server/db/schema';
import { manifestRevision } from '@/server/services/catalog';
import type { KioskAuth } from './auth';
import { KioskApiError } from './http';

const WAIT_MS = 25_000;
const STEP_MS = 1_000;
/** A command nobody picked up (kiosk off) stops being offered after this. */
export const COMMAND_TTL_MS = 10 * 60_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * GET /kiosk/wait?rev=&manifest=: held open until something is new for this kiosk (a newer
 * settings revision, new templates, commands from the Event Console) or ~25 s passed. Checks
 * the database once a second; one open request per kiosk.
 */
export async function waitForKiosk(auth: KioskAuth, have: { revision: number; manifest: number }, signal: AbortSignal): Promise<KioskWaitResponse> {
  const deadline = Date.now() + WAIT_MS;
  // An open wait means the kiosk is online right now (the Event Console sees it within seconds)
  await db().update(kiosks).set({ lastSeenAt: new Date() }).where(eq(kiosks.id, auth.kiosk.id));
  for (;;) {
    const now = new Date();
    // Expire what the kiosk never collected
    await db()
      .update(kioskCommands)
      .set({ status: 'failed', message: 'ตู้ไม่ได้รับคำสั่ง (ออฟไลน์?)', doneAt: now })
      .where(and(eq(kioskCommands.kioskRowId, auth.kiosk.id), eq(kioskCommands.status, 'pending'), lt(kioskCommands.createdAt, new Date(now.getTime() - COMMAND_TTL_MS))));
    const pending = await db()
      .select()
      .from(kioskCommands)
      .where(and(eq(kioskCommands.kioskRowId, auth.kiosk.id), eq(kioskCommands.status, 'pending')))
      .orderBy(kioskCommands.createdAt)
      .limit(20);
    const row = (await db().select({ currentRevision: kiosks.currentRevision }).from(kiosks).where(eq(kiosks.id, auth.kiosk.id)).limit(1))[0];
    const revision = row?.currentRevision ?? 0;
    const manifest = await manifestRevision();
    const changed = pending.length > 0 || revision > have.revision || manifest !== have.manifest;
    if (changed || Date.now() >= deadline || signal.aborted) {
      if (pending.length) {
        await db().update(kioskCommands).set({ status: 'sent', sentAt: now }).where(inArray(kioskCommands.id, pending.map((c) => c.id)));
      }
      const commands: KioskCommand[] = pending.map((c) => ({ id: c.id, type: c.type, payload: c.payload }));
      return { changed, revision, manifestRevision: manifest, commands };
    }
    await sleep(STEP_MS);
  }
}

/** POST /kiosk/commands/{id}/result */
export async function commandResult(auth: KioskAuth, id: string, data: z.output<typeof CommandResultSchema>) {
  const cmd = (await db().select().from(kioskCommands).where(and(eq(kioskCommands.id, id), eq(kioskCommands.kioskRowId, auth.kiosk.id))).limit(1))[0];
  if (!cmd) throw new KioskApiError('AD0003', 404, 'ไม่พบคำสั่ง');
  await db().update(kioskCommands).set({ status: data.status, message: data.message ?? null, doneAt: new Date() }).where(eq(kioskCommands.id, id));
}
