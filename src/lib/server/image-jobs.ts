import { randomUUID } from "node:crypto";
import type { ImageMode, ProviderId } from "../models";
import type { CreateImageJobResponse, ImageBatchDetailResponse, ImageJobResponse, ImageJobStatus, ImageJobsResponse } from "../types";
import { AppError } from "./errors";
import { classifyImageJobFailure } from "./image-job-failures";
import { saveUploadedFile } from "./files";
import { prisma } from "./db";
import { refundPlatformQuota, reservePlatformQuota } from "./usage";
import {
  assertImageQueueConnectionReady,
  checkImageQueueConnection,
  enqueueImageJob,
  getImageQueueJobCounts,
  getImageQueueRuntimeSettings,
  getImageWorkerConcurrency,
  isImageQueueEnabled,
  removeQueuedImageJob
} from "./image-queue";
import { refreshImageQueueSettings } from "./image-queue-settings";
import {
  attachJobToBatchItem,
  markBatchItemCreating,
  markBatchItemFailed,
  markBatchItemPaused,
  markBatchItemRunning,
  markBatchItemSucceeded,
  readImageBatchForUser
} from "./batches";
import { buildFinishedJobAfterClearFilter, buildFinishedJobVisibilityFilter } from "../job-monitor";
import { parseBatchStartPrompts } from "../batch-start";
import {
  getImageJobQueueSnapshotFromDeps,
  type ImageJobQueueSnapshot
} from "./image-job-diagnostics";
import {
  forceKillImageJobForUserWithDeps,
  pauseImageJobForUserWithDeps,
  resumeImageJobForUserWithDeps,
  retryImageJobForUserWithDeps
} from "./image-job-actions";
import {
  ensurePendingImageJobScheduledWithScheduler,
  getImageQueueErrorMessage,
  readImageBatchForUserWithPendingRepairWithDeps,
  repairPendingImageJobsForReadWithDeps,
  restorePendingImageJobsToQueueWithDeps,
  scheduleImageJobWithDeps
} from "./image-job-scheduler";
import {
  buildImageJobRequest,
  getBatchStartPromptErrorMessage,
  getOptionalString,
  getString,
  parseJobRequest,
  resolveImageJobFormInput,
  type ImageJobRequest
} from "./image-job-input";
import {
  runImageJobWithDeps,
  type RunImageJobOptions
} from "./image-job-runner";
export { RetryableImageJobError } from "./image-job-runner";

const RUNNING_JOB_TIMEOUT_MS = 30 * 60 * 1000;
const STALE_JOB_ERROR = "Image generation was interrupted before completion. Please start a new request.";
const DEFAULT_IMAGE_JOB_SCHEDULER_INTERVAL_MS = 5000;
const IMAGE_JOB_STALE_SWEEP_INTERVAL_MS = 30 * 1000;
const IMAGE_JOB_CLAIM_SCAN_LIMIT = 50;
const IMAGE_JOB_RECENT_STATS_MS = 60 * 60 * 1000;
const IMAGE_JOB_WORKER_ID = `${process.env.HOSTNAME ?? "local"}:${process.pid}:${randomUUID()}`;

type StoredImageJob = {
  id: string;
  userId: string;
  status: string;
  provider: string;
  model: string;
  mode: string;
  prompt: string;
  requestJson: string;
  batchId: string | null;
  batchItemId: string | null;
  resultId: string | null;
  error: string | null;
  lockedBy: string | null;
  lockedAt: Date | null;
  heartbeatAt: Date | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  queueWaitMs: number | null;
  executionMs: number | null;
  upstreamMs: number | null;
  fileSaveMs: number | null;
  createdAt: Date;
  updatedAt: Date;
};

type ImageJobClient = {
  create(input: { data: Record<string, unknown> }): Promise<StoredImageJob>;
  findFirst(input: { where: Record<string, unknown> }): Promise<StoredImageJob | null>;
  findMany(input: { where?: Record<string, unknown>; orderBy?: Record<string, unknown>; take?: number }): Promise<StoredImageJob[]>;
  findUnique(input: { where: { id: string } }): Promise<StoredImageJob | null>;
  count(input: { where?: Record<string, unknown> }): Promise<number>;
  update(input: { where: { id: string }; data: Record<string, unknown> }): Promise<StoredImageJob>;
  updateMany(input: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
};

const activeJobIds = new Set<string>();
const activeUserJobCounts = new Map<string, number>();
let drainingImageJobs = false;
let schedulerStarted = false;
let lastStaleSweepAt = 0;

function getImageJobConcurrency() {
  return getImageQueueRuntimeSettings().imageJobConcurrency;
}

function getImageJobUserConcurrency(globalConcurrency = getImageJobConcurrency()) {
  return Math.min(getImageQueueRuntimeSettings().imageJobUserConcurrency, globalConcurrency);
}

function isInlineImageJobWorkerEnabled() {
  return !isImageQueueEnabled();
}

function ensureInlineImageJobScheduler() {
  if (!isInlineImageJobWorkerEnabled()) return;
  ensureImageJobScheduler();
}

function getActiveUserJobCount(userId: string) {
  return activeUserJobCounts.get(userId) ?? 0;
}

function markJobActive(job: StoredImageJob) {
  activeJobIds.add(job.id);
  activeUserJobCounts.set(job.userId, getActiveUserJobCount(job.userId) + 1);
}

function markJobInactive(job: StoredImageJob) {
  activeJobIds.delete(job.id);

  const nextCount = getActiveUserJobCount(job.userId) - 1;
  if (nextCount <= 0) {
    activeUserJobCounts.delete(job.userId);
  } else {
    activeUserJobCounts.set(job.userId, nextCount);
  }
}

function unrefTimer(timer: ReturnType<typeof setInterval>) {
  (timer as { unref?: () => void }).unref?.();
}

function imageJobClient() {
  const client = (prisma as unknown as { imageJob?: ImageJobClient }).imageJob;
  if (!client) {
    throw new AppError("Image job database client is not ready. Please rebuild the image so Prisma Client is regenerated.", 503);
  }

  return client;
}

function resolveStoredJobStatus(status: string): ImageJobStatus {
  if (status === "paused" || status === "running" || status === "succeeded" || status === "failed") return status;
  return "pending";
}

function toJobResponse(job: StoredImageJob): ImageJobResponse {
  const status = resolveStoredJobStatus(job.status);
  return {
    id: job.id,
    status,
    provider: job.provider as ProviderId,
    model: job.model,
    mode: job.mode as ImageMode,
    prompt: job.prompt,
    batchId: job.batchId ?? undefined,
    batchItemId: job.batchItemId ?? undefined,
    resultId: job.resultId ?? undefined,
    imageUrl: status === "succeeded" && job.resultId ? `/api/images/file/${job.resultId}` : undefined,
    thumbnailUrl: status === "succeeded" && job.resultId ? `/api/images/thumb/${job.resultId}` : undefined,
    error: job.error ?? undefined,
    queueWaitMs: job.queueWaitMs ?? undefined,
    executionMs: job.executionMs ?? undefined,
    upstreamMs: job.upstreamMs ?? undefined,
    fileSaveMs: job.fileSaveMs ?? undefined,
    createdAt: job.createdAt.toISOString(),
    startedAt: job.startedAt?.toISOString(),
    finishedAt: job.finishedAt?.toISOString()
  };
}

async function refundJobPlatformQuota(job: StoredImageJob) {
  let input: ImageJobRequest;

  try {
    input = parseJobRequest(job.requestJson);
  } catch (error) {
    console.warn("[images/jobs] could not parse job payload for quota refund", {
      jobId: job.id,
      cause: error instanceof Error ? error.message : String(error)
    });
    return;
  }

  await refundPlatformQuota(job.userId, input.platformQuotaDate);
}

function isStaleRunningJob(job: StoredImageJob) {
  const lastHeartbeatAt = job.heartbeatAt ?? job.lockedAt ?? job.startedAt;

  return job.status === "running"
    && Boolean(lastHeartbeatAt)
    && !activeJobIds.has(job.id)
    && Date.now() - lastHeartbeatAt!.getTime() > RUNNING_JOB_TIMEOUT_MS;
}

async function failStaleRunningJob(job: StoredImageJob) {
  const failedAt = new Date();
  const failure = classifyImageJobFailure(STALE_JOB_ERROR);
  const failed = await imageJobClient().updateMany({
    where: {
      id: job.id,
      status: "running"
    },
    data: {
      status: "failed",
      error: STALE_JOB_ERROR,
      failureCode: failure.code,
      failureCategory: failure.category,
      lockedBy: null,
      lockedAt: null,
      heartbeatAt: null,
      finishedAt: failedAt,
      executionMs: job.startedAt ? Math.max(0, failedAt.getTime() - job.startedAt.getTime()) : undefined
    }
  });

  if (failed.count === 0) {
    return null;
  }

  const failedJob = {
    ...job,
    status: "failed",
    error: STALE_JOB_ERROR,
    lockedBy: null,
    lockedAt: null,
    heartbeatAt: null,
    finishedAt: failedAt,
    executionMs: job.startedAt ? Math.max(0, failedAt.getTime() - job.startedAt.getTime()) : job.executionMs,
    updatedAt: failedAt
  };

  await refundJobPlatformQuota(failedJob);

  return failedJob;
}

async function sweepStaleRunningJobs() {
  const now = Date.now();
  if (now - lastStaleSweepAt < IMAGE_JOB_STALE_SWEEP_INTERVAL_MS) return;
  lastStaleSweepAt = now;

  let staleJobs: StoredImageJob[];

  try {
    staleJobs = await imageJobClient().findMany({
      where: {
        status: "running"
      },
      orderBy: {
        startedAt: "asc"
      },
      take: IMAGE_JOB_CLAIM_SCAN_LIMIT
    });
  } catch (error) {
    console.warn("[images/jobs] stale sweep failed", {
      cause: error instanceof Error ? error.message : String(error)
    });
    return;
  }

  for (const job of staleJobs) {
    if (!isStaleRunningJob(job)) continue;
    await failStaleRunningJob(job);
  }
}

async function getPendingClaimCandidates(limit: number, excludedUserIds: string[] = []) {
  return imageJobClient().findMany({
    where: {
      status: "pending",
      ...(excludedUserIds.length > 0 ? { userId: { notIn: excludedUserIds } } : {})
    },
    orderBy: {
      createdAt: "asc"
    },
    take: limit
  });
}

async function claimPendingImageJob(job: StoredImageJob) {
  const now = new Date();
  const claimed = await imageJobClient().updateMany({
    where: {
      id: job.id,
      status: "pending"
    },
    data: {
      status: "running",
      error: null,
      lockedBy: IMAGE_JOB_WORKER_ID,
      lockedAt: now,
      heartbeatAt: now,
      startedAt: now,
      finishedAt: null,
      queueWaitMs: Math.max(0, now.getTime() - job.createdAt.getTime())
    }
  });

  if (claimed.count === 0) return null;

  return imageJobClient().findUnique({ where: { id: job.id } });
}

export async function createImageJobFromFormData(userId: string, formData: FormData): Promise<CreateImageJobResponse> {
  const prompt = getString(formData, "prompt");
  const batchId = getOptionalString(formData, "batchId");
  const batchItemId = getOptionalString(formData, "batchItemId");

  if ((batchId && !batchItemId) || (!batchId && batchItemId)) {
    throw new AppError("Batch metadata is incomplete.");
  }

  if (batchId && batchItemId) {
    await markBatchItemCreating(userId, batchId, batchItemId);
  }

  const input = await resolveImageJobFormInput(userId, formData, prompt);
  const jobs = imageJobClient();
  const platformQuotaDate = input.resolvedProvider.source !== "user"
    ? await reservePlatformQuota(userId)
    : undefined;

  try {
    const uploadedFiles = await Promise.all(input.files.map((file) => saveUploadedFile(userId, file)));
    const jobRequest = buildImageJobRequest(input, input.prompt, uploadedFiles.map((file) => file.id), platformQuotaDate);

    const job = await jobs.create({
      data: {
        userId,
        status: "pending",
        provider: input.provider,
        model: input.model.modelId,
        mode: input.mode,
        prompt,
        requestJson: JSON.stringify(jobRequest),
        batchId,
        batchItemId
      }
    });

    if (batchId && batchItemId) {
      await attachJobToBatchItem(userId, batchId, batchItemId, job.id);
    }

    return {
      jobId: job.id,
      status: "pending"
    };
  } catch (error) {
    await refundPlatformQuota(userId, platformQuotaDate);

    const message = error instanceof Error ? error.message : String(error);
    if (/imageJob/i.test(message) || /no such table.*ImageJob/i.test(message) || /relation .*ImageJob.* does not exist/i.test(message)) {
      throw new AppError("Image job table is not ready. Please run database migrations before generating images.", 503);
    }

    if (batchId && batchItemId) {
      await markBatchItemFailed(userId, batchId, batchItemId, error);
    }

    throw error;
  }
}

export async function createAndScheduleImageBatchFromFormData(userId: string, formData: FormData): Promise<ImageBatchDetailResponse> {
  const parsedPrompts = parseBatchStartPrompts(formData.getAll("prompts"));
  if (parsedPrompts.error) {
    throw new AppError(getBatchStartPromptErrorMessage(parsedPrompts.error), parsedPrompts.error === "empty" ? 400 : 413);
  }

  const prompts = parsedPrompts.prompts;
  const input = await resolveImageJobFormInput(userId, formData, prompts[0]);
  const name = getOptionalString(formData, "name")?.slice(0, 80) ?? `Batch ${new Date().toLocaleString("sv-SE")}`;
  const promptFormat = getString(formData, "promptFormat") === "lines" ? "lines" : "blocks";
  const platformQuotaDates: Array<string | undefined> = [];
  let batchId = "";
  const jobIds: string[] = [];

  try {
    if (input.resolvedProvider.source !== "user") {
      for (let index = 0; index < prompts.length; index += 1) {
        platformQuotaDates[index] = await reservePlatformQuota(userId);
      }
    }

    const uploadedFiles = await Promise.all(input.files.map((file) => saveUploadedFile(userId, file)));
    const uploadImageIds = uploadedFiles.map((file) => file.id);

    await prisma.$transaction(async (tx) => {
      const batch = await tx.imageBatch.create({
        data: {
          userId,
          name,
          provider: input.provider,
          model: input.model.modelId,
          mode: input.mode,
          totalCount: prompts.length,
          promptFormat
        }
      });
      batchId = batch.id;

      for (let itemIndex = 0; itemIndex < prompts.length; itemIndex += 1) {
        const prompt = prompts[itemIndex];
        const item = await tx.imageBatchItem.create({
          data: {
            batchId: batch.id,
            userId,
            itemIndex,
            provider: input.provider,
            model: input.model.modelId,
            mode: input.mode,
            prompt,
            status: "pending"
          }
        });
        const jobRequest = buildImageJobRequest(input, prompt, uploadImageIds, platformQuotaDates[itemIndex]);
        const job = await tx.imageJob.create({
          data: {
            userId,
            status: "pending",
            provider: input.provider,
            model: input.model.modelId,
            mode: input.mode,
            prompt,
            requestJson: JSON.stringify(jobRequest),
            batchId: batch.id,
            batchItemId: item.id
          }
        });

        jobIds.push(job.id);
        await tx.imageBatchItem.update({
          where: { id: item.id },
          data: {
            jobId: job.id,
            status: "pending"
          }
        });
      }
    });
  } catch (error) {
    await Promise.all(platformQuotaDates.map((date) => refundPlatformQuota(userId, date)));
    throw error;
  }

  const scheduleResults = await Promise.allSettled(jobIds.map((jobId) => scheduleImageJob(jobId)));
  const failedSchedules = scheduleResults.filter((result) => result.status === "rejected");
  if (failedSchedules.length > 0) {
    console.warn("[images/jobs] batch jobs could not all be scheduled", {
      batchId,
      failed: failedSchedules.length
    });
  }

  return readImageBatchForUser(userId, batchId);
}

function getImageJobSchedulerDeps() {
  return {
    imageJobClient: imageJobClient(),
    isImageQueueEnabled,
    enqueueImageJob,
    startImageJob,
    assertImageQueueConnectionReady,
    markBatchItemFailed,
    refundJobPlatformQuota,
    readImageBatchForUser
  };
}

export async function scheduleImageJob(jobId: string) {
  await refreshImageQueueSettings();
  return scheduleImageJobWithDeps(jobId, getImageJobSchedulerDeps());
}

async function ensurePendingImageJobScheduled(jobId: string, context: Parameters<typeof ensurePendingImageJobScheduledWithScheduler>[1]) {
  await refreshImageQueueSettings();
  return ensurePendingImageJobScheduledWithScheduler(jobId, context, getImageJobSchedulerDeps());
}

async function repairPendingImageJobsForRead(
  jobs: StoredImageJob[],
  context: Parameters<typeof repairPendingImageJobsForReadWithDeps>[1],
  limit?: number
) {
  return repairPendingImageJobsForReadWithDeps(jobs, context, getImageJobSchedulerDeps(), limit);
}

export async function readImageBatchForUserWithPendingRepair(
  userId: string,
  batchId: string
): Promise<ImageBatchDetailResponse> {
  return readImageBatchForUserWithPendingRepairWithDeps(userId, batchId, getImageJobSchedulerDeps());
}

function getImageJobActionDeps() {
  return {
    imageJobClient: imageJobClient(),
    toJobResponse,
    isImageQueueEnabled,
    enqueueImageJob,
    removeQueuedImageJob,
    startImageJob,
    getImageQueueErrorMessage,
    markBatchItemPaused,
    markBatchItemFailed,
    attachJobToBatchItem,
    reservePlatformQuota,
    refundPlatformQuota,
    refundJobPlatformQuota
  };
}

function getImageJobRunnerDeps() {
  return {
    workerId: IMAGE_JOB_WORKER_ID,
    imageJobClient: imageJobClient(),
    markBatchItemRunning,
    markBatchItemSucceeded,
    markBatchItemFailed,
    attachJobToBatchItem,
    refundJobPlatformQuota
  };
}

export async function pauseImageJobForUser(userId: string, jobId: string): Promise<ImageJobResponse> {
  return pauseImageJobForUserWithDeps(userId, jobId, getImageJobActionDeps());
}

export async function resumeImageJobForUser(userId: string, jobId: string): Promise<ImageJobResponse> {
  return resumeImageJobForUserWithDeps(userId, jobId, getImageJobActionDeps());
}

export async function forceKillImageJobForUser(userId: string, jobId: string): Promise<ImageJobResponse> {
  return forceKillImageJobForUserWithDeps(userId, jobId, getImageJobActionDeps());
}

export async function restorePendingImageJobsToQueue(limit = 100) {
  await refreshImageQueueSettings();
  return restorePendingImageJobsToQueueWithDeps(limit, getImageJobSchedulerDeps());
}

export function startImageJob(_jobId?: string) {
  if (!isInlineImageJobWorkerEnabled()) return;

  ensureImageJobScheduler();
  void drainImageJobQueue();
}

function ensureImageJobScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;

  const timer = setInterval(() => {
    void drainImageJobQueue();
  }, DEFAULT_IMAGE_JOB_SCHEDULER_INTERVAL_MS);
  unrefTimer(timer);
}

async function getRunningJobCountForUser(userId: string) {
  return imageJobClient().count({
    where: {
      userId,
      status: "running"
    }
  });
}

async function drainImageJobQueue() {
  if (drainingImageJobs) return;
  drainingImageJobs = true;

  try {
    await refreshImageQueueSettings();
    await sweepStaleRunningJobs();

    const concurrency = getImageJobConcurrency();
    const userConcurrency = getImageJobUserConcurrency(concurrency);
    const runningByUser = new Map<string, number>();
    const blockedUserIds = new Set<string>();

    while (activeJobIds.size < concurrency) {
      const candidates = await getPendingClaimCandidates(IMAGE_JOB_CLAIM_SCAN_LIMIT, [...blockedUserIds]);
      if (candidates.length === 0) break;

      let launched = false;

      for (const candidate of candidates) {
        if (activeJobIds.size >= concurrency) break;
        if (activeJobIds.has(candidate.id)) continue;

        let runningForUser = runningByUser.get(candidate.userId);
        if (runningForUser === undefined) {
          runningForUser = Math.max(getActiveUserJobCount(candidate.userId), await getRunningJobCountForUser(candidate.userId));
          runningByUser.set(candidate.userId, runningForUser);
        }

        if (runningForUser >= userConcurrency) {
          blockedUserIds.add(candidate.userId);
          continue;
        }

        const claimedJob = await claimPendingImageJob(candidate);
        if (!claimedJob) continue;

        launched = true;
        runningByUser.set(candidate.userId, runningForUser + 1);
        markJobActive(claimedJob);

        void runImageJobWithDeps(claimedJob, {}, getImageJobRunnerDeps())
          .catch((error) => {
            console.error("[images/jobs] runner crashed", {
              jobId: claimedJob.id,
              cause: error instanceof Error ? error.message : String(error)
            });
          })
          .finally(() => {
            markJobInactive(claimedJob);
            void drainImageJobQueue();
          });
      }

      if (!launched) break;
    }
  } finally {
    drainingImageJobs = false;
  }
}

export async function runClaimedImageJobById(jobId: string, options: RunImageJobOptions = {}) {
  const job = await imageJobClient().findUnique({ where: { id: jobId } });
  if (!job) {
    throw new AppError("Image job not found.", 404);
  }

  if (job.status === "paused") return toJobResponse(job);
  if (job.status === "succeeded") return toJobResponse(job);
  if (job.status === "failed") return toJobResponse(job);

  const claimedJob = job.status === "running" && job.lockedBy === IMAGE_JOB_WORKER_ID
    ? job
    : await claimPendingImageJob(job);

  if (!claimedJob) {
    const latest = await imageJobClient().findUnique({ where: { id: jobId } });
    if (latest) return toJobResponse(latest);
    throw new AppError("Image job not found.", 404);
  }

  markJobActive(claimedJob);
  try {
    await runImageJobWithDeps(claimedJob, options, getImageJobRunnerDeps());
  } finally {
    markJobInactive(claimedJob);
  }

  const finished = await imageJobClient().findUnique({ where: { id: jobId } });
  if (!finished) {
    throw new AppError("Image job not found.", 404);
  }

  return toJobResponse(finished);
}

export async function getImageJobQueueSnapshot(): Promise<ImageJobQueueSnapshot> {
  await refreshImageQueueSettings();
  return getImageJobQueueSnapshotFromDeps({
    workerId: IMAGE_JOB_WORKER_ID,
    activeCount: activeJobIds.size,
    recentStatsMs: IMAGE_JOB_RECENT_STATS_MS,
    imageJobClient: imageJobClient(),
    ensureInlineImageJobScheduler,
    isRedisQueueEnabled: isImageQueueEnabled,
    checkImageQueueConnection,
    getImageQueueJobCounts,
    getInlineConcurrency: getImageJobConcurrency,
    getInlineUserConcurrency: getImageJobUserConcurrency,
    getRedisWorkerConcurrency: getImageWorkerConcurrency,
    getQueueRuntimeSettings: getImageQueueRuntimeSettings
  });
}

export async function getImageJobForUser(userId: string, jobId: string): Promise<ImageJobResponse> {
  let job: StoredImageJob | null;

  try {
    job = await imageJobClient().findFirst({
      where: {
        id: jobId,
        userId
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/imageJob/i.test(message) || /no such table.*ImageJob/i.test(message) || /relation .*ImageJob.* does not exist/i.test(message)) {
      throw new AppError("Image job table is not ready. Please run database migrations before checking image jobs.", 503);
    }

    throw error;
  }

  if (!job) {
    throw new AppError("Image job not found.", 404);
  }

  if (isStaleRunningJob(job)) {
    job = await failStaleRunningJob(job) ?? job;
  }

  if (job.status === "pending") {
    await ensurePendingImageJobScheduled(job.id, { source: "job-detail" });
  }

  return toJobResponse(job);
}

export async function listImageJobsForUser(userId: string, input: {
  scope?: string | null;
  limit?: string | null;
}): Promise<ImageJobsResponse> {
  await refreshImageQueueSettings();
  ensureInlineImageJobScheduler();
  await sweepStaleRunningJobs();

  const parsedLimit = Number.parseInt(input.limit ?? "", 10);
  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 50) : 20;
  const scope = input.scope === "active" || input.scope === "failed" || input.scope === "recent"
    ? input.scope
    : "recent";
  const statusFilter = scope === "active"
    ? { in: ["pending", "running"] }
    : scope === "failed"
      ? "failed"
      : undefined;

  let jobs: StoredImageJob[];

  try {
    const monitorUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { jobMonitorFinishedClearedAt: true }
    });
    const finishedClearedAt = scope === "active" ? null : monitorUser?.jobMonitorFinishedClearedAt ?? null;
    const finishedClearedFilter = scope === "failed"
      ? null
      : buildFinishedJobVisibilityFilter(finishedClearedAt);

    jobs = await imageJobClient().findMany({
      where: {
        userId,
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(scope === "failed" ? (buildFinishedJobAfterClearFilter(finishedClearedAt) ?? {}) : {}),
        ...(finishedClearedFilter ? { AND: [finishedClearedFilter] } : {})
      },
      orderBy: { createdAt: "desc" },
      take: limit
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/imageJob/i.test(message) || /no such table.*ImageJob/i.test(message) || /relation .*ImageJob.* does not exist/i.test(message)) {
      throw new AppError("Image job table is not ready. Please run database migrations before listing image jobs.", 503);
    }

    throw error;
  }

  if (scope === "active") {
    await repairPendingImageJobsForRead(jobs, { source: "job-list-active" }, limit);
  }

  return {
    jobs: jobs.map(toJobResponse)
  };
}

export async function retryImageJobForUser(userId: string, jobId: string): Promise<CreateImageJobResponse> {
  return retryImageJobForUserWithDeps(userId, jobId, getImageJobActionDeps());
}
