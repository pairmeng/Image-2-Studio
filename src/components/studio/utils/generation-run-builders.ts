import type { ImageMode } from "../../../lib/models";
import { isRetryableBatchItemStatus } from "../../../lib/image-job-state";
import type { ImageJobResponse } from "../../../lib/types";

type GenerationReferenceInput = {
  files: readonly File[];
  sourceImageIds: readonly string[];
};

type PendingGenerationInput = GenerationReferenceInput & {
  provider: string;
  model: string;
  mode: ImageMode;
  prompt: string;
  size: string;
  aspectRatio: string;
  quality: string;
  startedAt: number;
};

type RunningSingleRunInput = {
  runId: string;
  jobId: string;
  startedAt: number;
  prompt: string;
};

type RunningBatchRunInput = {
  runId: string;
  batchId: string;
  createdAt: string;
  totalCount: number;
  now?: number;
};

type BatchPollingDeadlineInput = {
  createdAt: string;
  currentDeadline: number;
  timeoutMs: number;
  pollIntervalMs: number;
};

type OptimisticImageJobInput = {
  jobId: string;
  status?: ImageJobResponse["status"];
  provider: string;
  model: string;
  mode: ImageMode;
  prompt: string;
  createdAt: number;
};

type BatchGenerationItemDefaults = {
  size: string;
  aspectRatio: string;
  quality: string;
};

type BatchResultSummaryItem = {
  status: string;
  error?: string;
  resultId?: string;
};

type BatchRunSummaryMessages = {
  batchTimedOut: string;
  generationFailed: string;
};

type BatchRetryItem = {
  id: string;
  status: string;
  batchId?: string;
};

const BATCH_QUEUE_TIMEOUT_ERROR_FRAGMENT = "10 minute queue limit";

export function getGenerationReferenceCount(input: GenerationReferenceInput) {
  return input.files.length + input.sourceImageIds.length;
}

export function buildPendingGeneration(input: PendingGenerationInput) {
  return {
    provider: input.provider,
    model: input.model,
    mode: input.mode,
    prompt: input.prompt,
    size: input.size,
    aspectRatio: input.aspectRatio,
    quality: input.quality,
    sourceImageIds: [...input.sourceImageIds],
    fileNames: input.files.map((file) => file.name),
    startedAt: input.startedAt
  };
}

export function buildRunningSingleRun(input: RunningSingleRunInput) {
  return {
    id: input.runId,
    kind: "single" as const,
    status: "running" as const,
    startedAt: input.startedAt,
    background: false,
    jobId: input.jobId,
    prompt: input.prompt
  };
}

export function buildRunningBatchRun(input: RunningBatchRunInput) {
  const fallbackStartedAt = input.now ?? Date.now();
  const startedAt = new Date(input.createdAt).getTime() || fallbackStartedAt;

  return {
    id: input.runId,
    kind: "batch" as const,
    status: "running" as const,
    startedAt,
    background: false,
    batchId: input.batchId,
    totalCount: input.totalCount
  };
}

export function getBatchPollingDeadline(input: BatchPollingDeadlineInput) {
  const batchStartedAt = new Date(input.createdAt).getTime();
  return Number.isNaN(batchStartedAt)
    ? input.currentDeadline
    : batchStartedAt + input.timeoutMs + input.pollIntervalMs;
}

export function applyBatchGenerationItemDefaults<T extends BatchGenerationItemDefaults>(
  items: readonly T[],
  defaults: BatchGenerationItemDefaults
) {
  return items.map((item) => ({
    ...item,
    ...defaults
  }));
}

export function buildOptimisticImageJob(input: OptimisticImageJobInput): ImageJobResponse {
  return {
    id: input.jobId,
    status: input.status ?? "pending",
    provider: input.provider,
    model: input.model,
    mode: input.mode,
    prompt: input.prompt,
    createdAt: new Date(input.createdAt).toISOString()
  };
}

export function hasBatchQueueTimeout(items: readonly BatchResultSummaryItem[]) {
  return items.some((item) => item.error?.includes(BATCH_QUEUE_TIMEOUT_ERROR_FRAGMENT));
}

export function getLastSuccessfulBatchResultId(items: readonly BatchResultSummaryItem[]) {
  return [...items].reverse().find((item) => item.resultId)?.resultId;
}

export function getCompletedBatchRunSummary(
  items: readonly BatchResultSummaryItem[],
  messages: BatchRunSummaryMessages
) {
  const failed = items.some((item) => item.status === "failed");
  const timedOut = hasBatchQueueTimeout(items);

  return {
    failed,
    timedOut,
    status: failed ? "failed" as const : "succeeded" as const,
    error: failed ? (timedOut ? messages.batchTimedOut : messages.generationFailed) : undefined
  };
}

export function isBatchItemRetryable(item: BatchRetryItem) {
  return isRetryableBatchItemStatus(item.status);
}

export function getRetryableBatchItems<T extends BatchRetryItem>(items: readonly T[]) {
  return items.filter(isBatchItemRetryable);
}

export function canUseServerBatchRetry(activeBatchId: string, items: readonly BatchRetryItem[]) {
  return Boolean(activeBatchId) && items.length > 0 && items.every((item) => Boolean(item.batchId));
}

export function getBatchRetryItemIds(items: readonly BatchRetryItem[]) {
  return items.map((item) => item.id);
}
