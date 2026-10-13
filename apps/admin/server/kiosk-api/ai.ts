import 'server-only';
import type { AiJobRequest, KioskAiJob, KioskAiStatus } from '@photobooth/contracts';
import { describeError } from '@photobooth/error-codes';
import type { AiJob } from '@/server/db/schema';
import { AiJobError, aiAvailability, createAiJob, kioskJob, jobResult, runAiJob, sweepAiJobs } from '@/server/services/ai-jobs';
import { aiSettingsSummary } from '@/server/services/ai-settings';
import { shownSettings } from '@/server/services/kiosk-config';
import { assertKioskServing, type KioskAuth } from './auth';
import { KioskApiError } from './http';

/** Kiosk side of AI through the Admin: status before payment, then job → poll → result. */

export async function handleAiStatus(auth: KioskAuth): Promise<KioskAiStatus> {
  await sweepAiJobs();
  const a = await aiAvailability(auth.org);
  const s = a.reason === 'not_configured' ? null : await aiSettingsSummary();
  const disabled = auth.kiosk.status === 'disabled';
  return {
    available: a.available && !disabled,
    reason: disabled ? 'suspended' : a.reason,
    month: a.month,
    used: a.used,
    quota: a.quota,
    provider: s?.activeProvider ?? null,
    model: s?.activeModel ?? null
  };
}

function parseImage(dataUrl: string) {
  const i = dataUrl.indexOf(',');
  return { mimeType: dataUrl.slice(5, dataUrl.indexOf(';')), data: dataUrl.slice(i + 1) };
}

/** Queues the job; the caller runs it after the response (Next `after`). */
export async function handleAiJobCreate(auth: KioskAuth, body: AiJobRequest): Promise<{ job: KioskAiJob; run: string | null }> {
  assertKioskServing(auth);
  await sweepAiJobs();
  try {
    // Every image is paid for, unless the shop chose free use (bypass) for this kiosk. A kiosk
    // with payments switched off and no bypass gets nothing for free on the platform's AI keys.
    const cur = await shownSettings(auth.kiosk);
    const free = !!cur && cur.settings.payment.bypass;
    if (!free && !cur?.settings.payment.enabled) throw new AiJobError('AD0008', 402, 'ร้านนี้ยังไม่ได้เปิดรับชำระเงินสำหรับภาพ AI');
    if (!free && !body.paymentId) throw new AiJobError('AD0008', 402, 'ภาพ AI ต้องชำระเงินก่อน');
    const { job, created } = await createAiJob(auth.org, auth.kiosk.id, {
      requestId: body.requestId,
      sceneId: body.sceneId,
      photo: parseImage(body.photo),
      crop: body.faceCrop ? parseImage(body.faceCrop) : null,
      payment: !free && body.paymentId ? { id: body.paymentId } : null
    });
    return { job: view(job), run: created ? job.id : null };
  } catch (err) {
    if (err instanceof AiJobError) throw new KioskApiError(err.code, err.status, err.message);
    throw err;
  }
}

export async function handleAiJobStatus(auth: KioskAuth, jobId: string): Promise<KioskAiJob> {
  const job = await kioskJob(auth.kiosk.id, jobId);
  if (!job) throw new KioskApiError('AD0003', 404, 'ไม่พบงานนี้');
  if (job.status === 'queued' || job.status === 'running') await sweepAiJobs();
  return view((await kioskJob(auth.kiosk.id, jobId))!);
}

export async function handleAiJobResult(auth: KioskAuth, jobId: string) {
  const job = await kioskJob(auth.kiosk.id, jobId);
  if (!job || job.status !== 'succeeded') throw new KioskApiError('AD0003', 404, 'ยังไม่มีภาพของงานนี้');
  const result = await jobResult(jobId);
  if (!result) throw new KioskApiError('AD0003', 410, 'ภาพของงานนี้ถูกลบแล้ว (เก็บไว้ 1 ชั่วโมง)');
  return result;
}

/** Runs a job in the background; failures are already recorded on the job row. */
export function runJobInBackground(jobId: string): Promise<void> {
  return runAiJob(jobId).catch((err) => console.error('[kiosk-api] ai job', jobId, err));
}

function view(job: AiJob): KioskAiJob {
  return {
    jobId: job.id,
    status: job.status,
    errorCode: job.errorCode,
    // Customers only see the code; staff read the cause in the kiosk's System Log
    errorMessage: job.errorCode ? (job.errorDetail ?? describeError(job.errorCode)?.title ?? null) : null,
    durationMs: job.durationMs,
    refined: job.refined
  };
}
