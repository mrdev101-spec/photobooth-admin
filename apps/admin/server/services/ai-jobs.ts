import 'server-only';
import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { aiJobFiles, aiJobs, aiUsageMonthly, catalogAssets, catalogTemplates, organizations, templateVersions, type AiJob, type Organization } from '@/server/db/schema';
import { newId } from '@/server/lib/ids';
import { isDuplicateKey } from '@/server/lib/errors';
import { readAsset } from '@/server/services/asset-store';
import { engineForScene } from '@/server/services/ai-settings';
import { AiEngineError, generateImage, type AiImage } from '@/server/ai/engine';
import { portraitPrompt, refinePrompt } from '@/server/ai/prompts';
import { SCENE_PROMPTS, sceneFromSpec, type ScenePrompt } from '@/server/ai/scene-prompts';
import { AiSceneSpecSchema, isUploadedTemplateId } from '@photobooth/contracts';
import { currentMonth } from '@/lib/ai-quota';
import { PaymentFlowError, claimPayment, releasePayment } from '@/server/services/payments';

/**
 * Customer AI images through the platform's key (docs §8.5). A job holds the customer photo
 * only while it runs; the result waits for the kiosk for at most an hour. The quota counts
 * images customers received (succeeded jobs) per customer per calendar month (Asia/Bangkok).
 */

/** A job that has not finished by then is treated as failed (provider timeouts are 2-3 min per pass). */
const STALE_MS = 8 * 60_000;
const RESULT_KEEP_MS = 60 * 60_000;
export { currentMonth };

export interface AiUsage {
  month: string;
  used: number;
  failed: number;
  /** Jobs still running (they count against the quota until they finish). */
  inFlight: number;
  /** null = unlimited */
  quota: number | null;
}

export async function orgAiUsage(org: Pick<Organization, 'id' | 'aiMonthlyQuota'>, month = currentMonth()): Promise<AiUsage> {
  const usage = (await db().select().from(aiUsageMonthly).where(and(eq(aiUsageMonthly.orgId, org.id), eq(aiUsageMonthly.month, month))).limit(1))[0];
  const since = new Date(Date.now() - STALE_MS);
  const [row] = await db()
    .select({ n: sql<number>`count(*)` })
    .from(aiJobs)
    .where(and(eq(aiJobs.orgId, org.id), inArray(aiJobs.status, ['queued', 'running']), sql`${aiJobs.createdAt} > ${since}`));
  return { month, used: usage?.images ?? 0, failed: usage?.failed ?? 0, inFlight: Number(row?.n ?? 0), quota: org.aiMonthlyQuota };
}

/** This month's usage of every customer (platform overview). */
export async function allAiUsage(month = currentMonth()) {
  return db()
    .select({ orgId: organizations.id, name: organizations.name, slug: organizations.slug, quota: organizations.aiMonthlyQuota, used: aiUsageMonthly.images, failed: aiUsageMonthly.failed })
    .from(organizations)
    .leftJoin(aiUsageMonthly, and(eq(aiUsageMonthly.orgId, organizations.id), eq(aiUsageMonthly.month, month)))
    .where(and(sql`${organizations.deletedAt} is null`, sql`${organizations.kind} <> 'stock'`))
    .orderBy(desc(aiUsageMonthly.images));
}

export type AiUnavailableReason = 'not_configured' | 'quota' | 'suspended';

export interface AiAvailability extends AiUsage {
  available: boolean;
  reason: AiUnavailableReason | null;
}

export async function aiAvailability(org: Organization): Promise<AiAvailability> {
  const usage = await orgAiUsage(org);
  const configured = !!(await engineForScene(false));
  const full = usage.quota != null && usage.used + usage.inFlight >= usage.quota;
  const reason: AiUnavailableReason | null = org.status !== 'active' ? 'suspended' : !configured ? 'not_configured' : full ? 'quota' : null;
  return { ...usage, available: !reason, reason };
}

/**
 * The generation brief of a scene: built-in ids from code, uploaded ones from their published
 * version (the platform's, or this customer's own). null = unknown / not offered to this customer.
 */
async function sceneBrief(sceneId: string, orgId: string): Promise<ScenePrompt | null> {
  if (SCENE_PROMPTS[sceneId]) return SCENE_PROMPTS[sceneId]!;
  if (!isUploadedTemplateId(sceneId)) return null;
  const row = (
    await db()
      .select({ spec: templateVersions.spec, orgId: catalogTemplates.orgId })
      .from(catalogTemplates)
      .innerJoin(templateVersions, and(eq(templateVersions.kind, catalogTemplates.kind), eq(templateVersions.templateId, catalogTemplates.id), eq(templateVersions.version, catalogTemplates.publishedVersion)))
      .where(and(eq(catalogTemplates.kind, 'ai-scene'), eq(catalogTemplates.id, sceneId), eq(catalogTemplates.status, 'published')))
      .limit(1)
  )[0];
  if (!row || (row.orgId && row.orgId !== orgId)) return null;
  const spec = AiSceneSpecSchema.safeParse(row.spec);
  return spec.success ? sceneFromSpec(spec.data) : null;
}

/** The scene's plate (poster without people) from its published version, if any. */
async function scenePlate(sceneId: string): Promise<AiImage | null> {
  const ref = (
    await db()
      .select({ files: templateVersions.files })
      .from(catalogTemplates)
      .innerJoin(templateVersions, and(eq(templateVersions.kind, catalogTemplates.kind), eq(templateVersions.templateId, catalogTemplates.id), eq(templateVersions.version, catalogTemplates.publishedVersion)))
      .where(and(eq(catalogTemplates.kind, 'ai-scene'), eq(catalogTemplates.id, sceneId), eq(catalogTemplates.status, 'published')))
      .limit(1)
  )[0]?.files?.plate;
  if (!ref) return null;
  const asset = (await db().select().from(catalogAssets).where(eq(catalogAssets.sha256, ref.sha256)).limit(1))[0];
  const bytes = asset ? await readAsset(asset.storageKey) : null;
  return bytes ? { mimeType: asset!.contentType, data: Buffer.from(bytes).toString('base64') } : null;
}

export class AiJobError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

export interface NewJob {
  requestId: string;
  sceneId: string;
  photo: AiImage;
  crop: AiImage | null;
  /** A paid AI payment made at this kiosk, or null when the shop uses free mode. */
  payment: { id: string } | null;
}

/** Queues a job (a retried request with the same requestId gets the existing job). */
export async function createAiJob(org: Organization, kioskRowId: string, input: NewJob): Promise<{ job: AiJob; created: boolean }> {
  const existing = await jobByRequest(kioskRowId, input.requestId);
  if (existing) return { job: existing, created: false };
  if (!(await sceneBrief(input.sceneId, org.id))) throw new AiJobError('TP0001', 404, 'ไม่พบฉากนี้');
  const availability = await aiAvailability(org);
  if (availability.reason === 'quota') throw new AiJobError('AD0009', 403, `โควตา AI เดือนนี้หมดแล้ว (${availability.used}/${availability.quota} ภาพ)`);
  if (availability.reason === 'not_configured') throw new AiJobError('AD0014', 503, 'ผู้ให้บริการยังไม่ได้ตั้งค่า AI');
  if (availability.reason === 'suspended') throw new AiJobError('AD0005', 403, 'บัญชีลูกค้าถูกระงับ');

  const id = newId('aij');
  // One paid payment per image (taken before anything is generated; given back if the job fails)
  if (input.payment) {
    try {
      const holder = await claimPayment(org.id, kioskRowId, input.payment.id, `ai:${id}`);
      // The kiosk retried under a new request id: give it the job this payment already pays for
      // instead of refusing a customer who has paid
      if (holder) {
        const held = holder.startsWith('ai:') ? await jobById(holder.slice(3)) : null;
        if (held && held.kioskRowId === kioskRowId) return { job: held, created: false };
        throw new AiJobError('AD0008', 402, 'การชำระเงินนี้ถูกใช้ไปแล้ว');
      }
    } catch (err) {
      if (err instanceof PaymentFlowError) throw new AiJobError(err.code, err.status, err.message);
      throw err;
    }
  }
  try {
    await db().insert(aiJobs).values({ id, orgId: org.id, kioskRowId, requestId: input.requestId, sceneId: input.sceneId, paymentId: input.payment?.id ?? null, month: availability.month });
  } catch (err) {
    if (input.payment) await releasePayment(input.payment.id, `ai:${id}`);
    if (!isDuplicateKey(err)) throw err;
    return { job: (await jobByRequest(kioskRowId, input.requestId))!, created: false }; // the same request twice at once
  }
  const files = [
    { jobId: id, role: 'photo' as const, mimeType: input.photo.mimeType, bytes: Buffer.from(input.photo.data, 'base64') },
    ...(input.crop ? [{ jobId: id, role: 'crop' as const, mimeType: input.crop.mimeType, bytes: Buffer.from(input.crop.data, 'base64') }] : [])
  ];
  await db().insert(aiJobFiles).values(files);
  return { job: (await jobById(id))!, created: true };
}

async function jobByRequest(kioskRowId: string, requestId: string): Promise<AiJob | undefined> {
  return (await db().select().from(aiJobs).where(and(eq(aiJobs.kioskRowId, kioskRowId), eq(aiJobs.requestId, requestId))).limit(1))[0];
}

async function jobById(id: string): Promise<AiJob | undefined> {
  return (await db().select().from(aiJobs).where(eq(aiJobs.id, id)).limit(1))[0];
}

export async function kioskJob(kioskRowId: string, id: string): Promise<AiJob | undefined> {
  return (await db().select().from(aiJobs).where(and(eq(aiJobs.id, id), eq(aiJobs.kioskRowId, kioskRowId))).limit(1))[0];
}

async function fileOf(jobId: string, role: 'photo' | 'crop' | 'result'): Promise<AiImage | null> {
  const f = (await db().select().from(aiJobFiles).where(and(eq(aiJobFiles.jobId, jobId), eq(aiJobFiles.role, role))).limit(1))[0];
  return f ? { mimeType: f.mimeType, data: Buffer.from(f.bytes).toString('base64') } : null;
}

export async function jobResult(jobId: string): Promise<{ mimeType: string; bytes: Buffer } | null> {
  const f = (await db().select().from(aiJobFiles).where(and(eq(aiJobFiles.jobId, jobId), eq(aiJobFiles.role, 'result'))).limit(1))[0];
  return f ? { mimeType: f.mimeType, bytes: Buffer.from(f.bytes) } : null;
}

async function dropInputs(jobId: string) {
  await db().delete(aiJobFiles).where(and(eq(aiJobFiles.jobId, jobId), inArray(aiJobFiles.role, ['photo', 'crop'])));
}

async function countUsage(orgId: string, month: string, field: 'images' | 'failed') {
  await db()
    .insert(aiUsageMonthly)
    .values({ orgId, month, images: field === 'images' ? 1 : 0, failed: field === 'failed' ? 1 : 0 })
    .onDuplicateKeyUpdate({ set: { [field]: sql`${aiUsageMonthly[field]} + 1` } });
}

/**
 * Runs one queued job: portrait from the customer photo + the scene's plate, then the optional
 * face-refinement pass (its failure keeps the first result). Called after the response is sent.
 */
export async function runAiJob(jobId: string, log: (msg: string) => void = console.log): Promise<void> {
  const claimed = await db().update(aiJobs).set({ status: 'running', startedAt: new Date() }).where(and(eq(aiJobs.id, jobId), eq(aiJobs.status, 'queued')));
  if (claimed[0].affectedRows !== 1) return; // already taken
  const job = (await jobById(jobId))!;
  const t0 = Date.now();
  try {
    const scene = await sceneBrief(job.sceneId, job.orgId);
    if (!scene) throw new AiJobError('TP0001', 404, 'ไม่พบฉากนี้');
    const choice = await engineForScene(!!scene.thaiText);
    if (!choice) throw new AiJobError('AD0014', 503, 'ผู้ให้บริการยังไม่ได้ตั้งค่า AI');
    const { engine } = choice;
    await db().update(aiJobs).set({ provider: engine.provider, model: engine.model, imageSize: engine.imageSize }).where(eq(aiJobs.id, jobId));
    const photo = await fileOf(jobId, 'photo');
    if (!photo) throw new AiJobError('IN0001', 400, 'ไม่พบรูปลูกค้า');
    const crop = await fileOf(jobId, 'crop');
    const plate = await scenePlate(job.sceneId);

    let image = await generateImage(engine, portraitPrompt(scene, { hasCrop: !!crop, hasPlate: !!plate }), [photo, crop, plate].filter((x): x is AiImage => !!x));
    log(`[ai] ${jobId} portrait "${job.sceneId}" in ${Date.now() - t0} ms (${engine.provider}, ${engine.model})`);
    let refined = false;
    if (choice.faceRefine) {
      try {
        image = await generateImage(engine, refinePrompt(scene, { hasCrop: !!crop }), [image, photo, crop].filter((x): x is AiImage => !!x));
        refined = true;
      } catch (e) {
        log(`[ai] ${jobId} face refinement skipped: ${e instanceof Error ? e.message : e}`);
      }
    }
    await db().insert(aiJobFiles).values({ jobId, role: 'result', mimeType: image.mimeType, bytes: Buffer.from(image.data, 'base64') });
    await db().update(aiJobs).set({ status: 'succeeded', refined, durationMs: Date.now() - t0, finishedAt: new Date() }).where(eq(aiJobs.id, jobId));
    await countUsage(job.orgId, job.month, 'images');
  } catch (e) {
    const code = e instanceof AiEngineError || e instanceof AiJobError ? e.code : 'UN0000';
    const detail = (e instanceof Error ? e.message : String(e)).slice(0, 500);
    log(`[ai] ${jobId} failed [${code}] ${detail}`);
    await db().update(aiJobs).set({ status: 'failed', errorCode: code, errorDetail: detail, durationMs: Date.now() - t0, finishedAt: new Date() }).where(eq(aiJobs.id, jobId));
    await countUsage(job.orgId, job.month, 'failed');
    // The customer got no image: the payment can pay for the retry
    if (job.paymentId) await releasePayment(job.paymentId, `ai:${jobId}`);
  } finally {
    // The customer photo is only kept while the job runs
    await dropInputs(jobId);
  }
}

/** Housekeeping on every kiosk AI call: stuck jobs fail, old results and leftover photos go. */
export async function sweepAiJobs(): Promise<void> {
  const stale = new Date(Date.now() - STALE_MS);
  const stuck = await db().select({ id: aiJobs.id, orgId: aiJobs.orgId, month: aiJobs.month, paymentId: aiJobs.paymentId }).from(aiJobs).where(and(inArray(aiJobs.status, ['queued', 'running']), lt(aiJobs.createdAt, stale))).limit(50);
  for (const j of stuck) {
    const r = await db()
      .update(aiJobs)
      .set({ status: 'failed', errorCode: 'NW0002', errorDetail: 'งานค้างนานเกินกำหนด', finishedAt: new Date() })
      .where(and(eq(aiJobs.id, j.id), inArray(aiJobs.status, ['queued', 'running'])));
    if (r[0].affectedRows) {
      await countUsage(j.orgId, j.month, 'failed');
      if (j.paymentId) await releasePayment(j.paymentId, `ai:${j.id}`);
    }
  }
  await db().delete(aiJobFiles).where(lt(aiJobFiles.createdAt, new Date(Date.now() - RESULT_KEEP_MS)));
  if (stuck.length) await db().delete(aiJobFiles).where(inArray(aiJobFiles.jobId, stuck.map((j) => j.id)));
}

/** Recent jobs of one customer (or every customer) for the usage pages. */
export async function recentAiJobs(orgId: string | null, limit = 30) {
  return db()
    .select({ id: aiJobs.id, orgId: aiJobs.orgId, sceneId: aiJobs.sceneId, status: aiJobs.status, provider: aiJobs.provider, model: aiJobs.model, refined: aiJobs.refined, errorCode: aiJobs.errorCode, errorDetail: aiJobs.errorDetail, durationMs: aiJobs.durationMs, createdAt: aiJobs.createdAt, orgName: organizations.name })
    .from(aiJobs)
    .innerJoin(organizations, eq(organizations.id, aiJobs.orgId))
    .where(orgId ? eq(aiJobs.orgId, orgId) : undefined)
    .orderBy(desc(aiJobs.createdAt))
    .limit(limit);
}
