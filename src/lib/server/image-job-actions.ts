import type { CreateImageJobResponse, ImageJobResponse } from "../types";
import { isForceKillableImageJobStatus, isPausableImageJobStatus, isResumableImageJobStatus, isRetryableImageJobStatus } from "../image-job-state";
import { AppError } from "./errors";
import { classifyImageJobFailure } from "./image-job-failures";
import type { ImageJobRequest } from "./image-job-input";

const FORCE_KILLED_JOB_ERROR = "Task was force killed from job monitor.";

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

type ImageJobActionClient = {
  create(input: { data: Record<string, unknown> }): Promise<StoredImageJob>;
  findFirst(input: { where: Record<string, unknown> }): Promise<StoredImageJob | null>;
  findUnique(input: { where: { id: string } }): Promise<StoredImageJob | null>;
  updateMany(input: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
};

type ImageJobActionDeps = {
  imageJobClient: ImageJobActionClient;
  toJobResponse: (job: StoredImageJob) => ImageJobResponse;
  isImageQueueEnabled: () => boolean;
  enqueueImageJob: (jobId: string) => Promise<unknown>;
  removeQueuedImageJob: (jobId: string) => Promise<unknown>;
  startImageJob: (jobId?: string) => void;
  getImageQueueErrorMessage: (error: unknown) => string;
  markBatchItemPaused: (userId: string, batchId: string | null, batchItemId: string | null, error?: string) => Promise<unknown>;
  markBatchItemFailed: (userId: string, batchId: string | null, batchItemId: string | null, error: unknown) => Promise<unknown>;
  attachJobToBatchItem: (userId: string, batchId: string, batchItemId: string, jobId: string) => Promise<unknown>;
  reservePlatformQuota: (userId: string) => Promise<string | undefined>;
  refundPlatformQuota: (userId: string, date?: string) => Promise<unknown>;
  refundJobPlatformQuota: (job: StoredImageJob) => Promise<unknown>;
};

export async function pauseImageJobForUserWithDeps(
  userId: string,
  jobId: string,
  deps: ImageJobActionDeps
): Promise<ImageJobResponse> {
  const job = await deps.imageJobClient.findFirst({
    where: {
      id: jobId,
      userId
    }
  });

  if (!job) {
    throw new AppError("Image job not found.", 404);
  }

  if (!isPausableImageJobStatus(job.status)) {
    throw new AppError("Only pending jobs can be paused.", 409);
  }

  const updated = await deps.imageJobClient.updateMany({
    where: {
      id: job.id,
      status: "pending"
    },
    data: {
      status: "paused",
      error: null,
      lockedBy: null,
      lockedAt: null,
      heartbeatAt: null,
      startedAt: null,
      finishedAt: null
    }
  });

  if (updated.count === 0) {
    throw new AppError("Only pending jobs can be paused.", 409);
  }

  await deps.markBatchItemPaused(job.userId, job.batchId, job.batchItemId);

  if (deps.isImageQueueEnabled()) {
    try {
      await deps.removeQueuedImageJob(job.id);
    } catch (error) {
      console.warn("[images/jobs] queued job could not be removed during pause", {
        jobId: job.id,
        cause: error instanceof Error ? error.message : String(error)
      });
    }
  }

  const paused = await deps.imageJobClient.findUnique({ where: { id: job.id } });
  return deps.toJobResponse(paused ?? { ...job, status: "paused" });
}

export async function resumeImageJobForUserWithDeps(
  userId: string,
  jobId: string,
  deps: ImageJobActionDeps
): Promise<ImageJobResponse> {
  const job = await deps.imageJobClient.findFirst({
    where: {
      id: jobId,
      userId
    }
  });

  if (!job) {
    throw new AppError("Image job not found.", 404);
  }

  if (!isResumableImageJobStatus(job.status)) {
    throw new AppError("Only paused jobs can be resumed.", 409);
  }

  const updated = await deps.imageJobClient.updateMany({
    where: {
      id: job.id,
      status: "paused"
    },
    data: {
      status: "pending",
      error: null,
      lockedBy: null,
      lockedAt: null,
      heartbeatAt: null,
      startedAt: null,
      finishedAt: null
    }
  });

  if (updated.count === 0) {
    throw new AppError("Only paused jobs can be resumed.", 409);
  }

  if (job.batchId && job.batchItemId) {
    await deps.attachJobToBatchItem(job.userId, job.batchId, job.batchItemId, job.id);
  }

  try {
    if (deps.isImageQueueEnabled()) {
      await deps.enqueueImageJob(job.id);
    } else {
      deps.startImageJob(job.id);
    }
  } catch (error) {
    const message = deps.getImageQueueErrorMessage(error);
    await deps.imageJobClient.updateMany({
      where: {
        id: job.id,
        status: "pending"
      },
      data: {
        status: "paused",
        error: message,
        lockedBy: null,
        lockedAt: null,
        heartbeatAt: null,
        startedAt: null,
        finishedAt: null
      }
    });
    await deps.markBatchItemPaused(job.userId, job.batchId, job.batchItemId, message);
    throw new AppError(message, 503);
  }

  const resumed = await deps.imageJobClient.findUnique({ where: { id: job.id } });
  return deps.toJobResponse(resumed ?? { ...job, status: "pending", error: null });
}

export async function forceKillImageJobForUserWithDeps(
  userId: string,
  jobId: string,
  deps: ImageJobActionDeps
): Promise<ImageJobResponse> {
  const job = await deps.imageJobClient.findFirst({
    where: {
      id: jobId,
      userId
    }
  });

  if (!job) {
    throw new AppError("Image job not found.", 404);
  }

  if (!isForceKillableImageJobStatus(job.status)) {
    throw new AppError("Only unfinished jobs can be force killed.", 409);
  }

  const finishedAt = new Date();
  const failure = classifyImageJobFailure(FORCE_KILLED_JOB_ERROR);
  const updated = await deps.imageJobClient.updateMany({
    where: {
      id: job.id,
      userId,
      status: { in: ["pending", "running", "paused"] }
    },
    data: {
      status: "failed",
      error: FORCE_KILLED_JOB_ERROR,
      failureCode: failure.code,
      failureCategory: failure.category,
      lockedBy: null,
      lockedAt: null,
      heartbeatAt: null,
      finishedAt,
      executionMs: job.startedAt ? Math.max(0, finishedAt.getTime() - job.startedAt.getTime()) : undefined
    }
  });

  if (updated.count === 0) {
    const latest = await deps.imageJobClient.findUnique({ where: { id: job.id } });
    if (latest) return deps.toJobResponse(latest);
    throw new AppError("Image job not found.", 404);
  }

  if (deps.isImageQueueEnabled() && job.status === "pending") {
    try {
      await deps.removeQueuedImageJob(job.id);
    } catch (error) {
      console.warn("[images/jobs] queued job could not be removed during force kill", {
        jobId: job.id,
        cause: error instanceof Error ? error.message : String(error)
      });
    }
  }

  await deps.markBatchItemFailed(job.userId, job.batchId, job.batchItemId, FORCE_KILLED_JOB_ERROR);
  await deps.refundJobPlatformQuota(job);

  const killed = await deps.imageJobClient.findUnique({ where: { id: job.id } });
  return deps.toJobResponse(killed ?? {
    ...job,
    status: "failed",
    error: FORCE_KILLED_JOB_ERROR,
    lockedBy: null,
    lockedAt: null,
    heartbeatAt: null,
    finishedAt,
    executionMs: job.startedAt ? Math.max(0, finishedAt.getTime() - job.startedAt.getTime()) : job.executionMs,
    updatedAt: finishedAt
  });
}

export async function retryImageJobForUserWithDeps(
  userId: string,
  jobId: string,
  deps: ImageJobActionDeps
): Promise<CreateImageJobResponse> {
  const previousJob = await deps.imageJobClient.findFirst({
    where: {
      id: jobId,
      userId
    }
  });

  if (!previousJob) {
    throw new AppError("Image job not found.", 404);
  }

  if (previousJob.batchId || previousJob.batchItemId) {
    throw new AppError("Retry this job from its batch.", 400);
  }

  if (!isRetryableImageJobStatus(previousJob.status)) {
    throw new AppError("Only failed jobs can be retried.", 400);
  }

  let requestJson = previousJob.requestJson;
  let platformQuotaDate: string | undefined;

  try {
    const parsed = JSON.parse(previousJob.requestJson) as Partial<ImageJobRequest>;
    if (typeof parsed.platformQuotaDate === "string") {
      platformQuotaDate = await deps.reservePlatformQuota(userId);
      parsed.platformQuotaDate = platformQuotaDate;
      requestJson = JSON.stringify(parsed);
    }
  } catch {
    throw new AppError("Previous job payload is invalid.", 500);
  }

  let job: StoredImageJob;

  try {
    job = await deps.imageJobClient.create({
      data: {
        userId,
        status: "pending",
        provider: previousJob.provider,
        model: previousJob.model,
        mode: previousJob.mode,
        prompt: previousJob.prompt,
        requestJson
      }
    });
  } catch (error) {
    await deps.refundPlatformQuota(userId, platformQuotaDate);
    throw error;
  }

  return {
    jobId: job.id,
    status: "pending"
  };
}
