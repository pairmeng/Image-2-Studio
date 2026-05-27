import type { ImageBatchDetailResponse } from "../types";
import {
  DEFAULT_PENDING_IMAGE_JOB_REPAIR_LIMIT,
  ensurePendingImageJobScheduled as ensurePendingImageJobScheduledWithDeps,
  repairPendingBatchItemSchedules,
  repairPendingImageJobSchedules,
  type PendingImageJobScheduleContext,
  type PendingImageJobScheduleDeps
} from "../image-job-scheduling";
import { AppError } from "./errors";
import { classifyImageJobFailure } from "./image-job-failures";

type SchedulerImageJob = {
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

type SchedulerImageJobClient = {
  findMany(input: { where?: Record<string, unknown>; orderBy?: Record<string, unknown>; take?: number }): Promise<SchedulerImageJob[]>;
  findUnique(input: { where: { id: string } }): Promise<SchedulerImageJob | null>;
  updateMany(input: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
};

type ImageJobSchedulerDeps = {
  imageJobClient: SchedulerImageJobClient;
  isImageQueueEnabled: () => boolean;
  enqueueImageJob: (jobId: string) => Promise<unknown>;
  startImageJob: (jobId?: string) => void;
  assertImageQueueConnectionReady: () => Promise<unknown>;
  markBatchItemFailed: (userId: string, batchId: string | null, batchItemId: string | null, error: unknown) => Promise<unknown>;
  refundJobPlatformQuota: (job: SchedulerImageJob) => Promise<unknown>;
  readImageBatchForUser: (userId: string, batchId: string) => Promise<ImageBatchDetailResponse>;
};

function getPendingImageJobScheduleDeps(deps: ImageJobSchedulerDeps): PendingImageJobScheduleDeps {
  return {
    isRedisQueueEnabled: deps.isImageQueueEnabled,
    enqueueRedisJob: deps.enqueueImageJob,
    startInlineJob: deps.startImageJob,
    warn: (message, details) => console.warn(message, details)
  };
}

export function getImageQueueErrorMessage(error: unknown) {
  const cause = error instanceof Error ? error.message : String(error || "unknown error");
  return `Image job queue is not reachable. Check REDIS_URL authentication and connectivity. Cause: ${cause}`;
}

export async function scheduleImageJobWithDeps(jobId: string, deps: ImageJobSchedulerDeps) {
  if (deps.isImageQueueEnabled()) {
    try {
      await deps.enqueueImageJob(jobId);
      return;
    } catch (error) {
      await failPendingImageJobForQueueError(jobId, error, deps);
      throw new AppError(getImageQueueErrorMessage(error), 503);
    }
  }

  deps.startImageJob(jobId);
}

export async function ensurePendingImageJobScheduledWithScheduler(
  jobId: string,
  context: PendingImageJobScheduleContext,
  deps: ImageJobSchedulerDeps
) {
  return ensurePendingImageJobScheduledWithDeps(jobId, context, getPendingImageJobScheduleDeps(deps));
}

export async function repairPendingImageJobsForReadWithDeps(
  jobs: SchedulerImageJob[],
  context: PendingImageJobScheduleContext,
  deps: ImageJobSchedulerDeps,
  limit = DEFAULT_PENDING_IMAGE_JOB_REPAIR_LIMIT
) {
  return repairPendingImageJobSchedules(jobs, context, getPendingImageJobScheduleDeps(deps), { limit });
}

export async function readImageBatchForUserWithPendingRepairWithDeps(
  userId: string,
  batchId: string,
  deps: ImageJobSchedulerDeps
): Promise<ImageBatchDetailResponse> {
  const batch = await deps.readImageBatchForUser(userId, batchId);
  await repairPendingBatchItemSchedules(
    batch.items,
    { source: "batch-detail", batchId },
    getPendingImageJobScheduleDeps(deps)
  );
  return batch;
}

export async function restorePendingImageJobsToQueueWithDeps(limit: number, deps: ImageJobSchedulerDeps) {
  if (!deps.isImageQueueEnabled()) return 0;

  await deps.assertImageQueueConnectionReady();

  const jobs = await deps.imageJobClient.findMany({
    where: {
      status: "pending"
    },
    orderBy: {
      createdAt: "asc"
    },
    take: Math.min(Math.max(limit, 1), 1000)
  });

  let restored = 0;
  for (const job of jobs) {
    await deps.enqueueImageJob(job.id);
    restored += 1;
  }

  return restored;
}

async function failPendingImageJobForQueueError(jobId: string, error: unknown, deps: ImageJobSchedulerDeps) {
  const job = await deps.imageJobClient.findUnique({ where: { id: jobId } });
  if (!job || job.status !== "pending") return;

  const finishedAt = new Date();
  const message = getImageQueueErrorMessage(error);
  const failure = classifyImageJobFailure(message, { cause: error });
  const updated = await deps.imageJobClient.updateMany({
    where: {
      id: job.id,
      status: "pending"
    },
    data: {
      status: "failed",
      error: message,
      failureCode: failure.code,
      failureCategory: failure.category,
      lockedBy: null,
      lockedAt: null,
      heartbeatAt: null,
      finishedAt
    }
  });

  if (updated.count === 0) return;

  await deps.markBatchItemFailed(job.userId, job.batchId, job.batchItemId, message);
  await deps.refundJobPlatformQuota(job);
}
