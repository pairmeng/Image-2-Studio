import { isImageMode, isProviderId, type ImageMode, type ProviderId } from "../models";
import type { ImageBatchDetailResponse, ImageBatchItemResponse, ImageBatchResponse } from "../types";
import { isRetryableBatchItemStatus, resolveImageBatchStatusFromItemStatuses } from "../image-job-state";
import { AppError } from "./errors";
import { prisma } from "./db";
import { reservePlatformQuota } from "./usage";
import { expireImageBatchIfTimedOut } from "./batch-timeouts";

const MAX_BATCH_PROMPTS = 20;
const MAX_PROMPT_LENGTH = 2000;
const DEFAULT_BATCH_LIMIT = 20;
const MAX_BATCH_LIMIT = 50;

type StoredBatch = {
  id: string;
  name: string;
  provider: string;
  model: string;
  mode: string;
  status: string;
  totalCount: number;
  successCount: number;
  failedCount: number;
  promptFormat: string;
  createdAt: Date;
  updatedAt: Date;
  finishedAt: Date | null;
};

type StoredBatchItem = {
  id: string;
  batchId: string;
  itemIndex: number;
  provider: string;
  model: string;
  mode: string;
  prompt: string;
  status: string;
  jobId: string | null;
  resultId: string | null;
  error: string | null;
  retryCount: number;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
};

type BatchWithItems = StoredBatch & {
  items: StoredBatchItem[];
};

function normalizeLimit(value: string | null | undefined) {
  if (!value) return DEFAULT_BATCH_LIMIT;

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_BATCH_LIMIT;

  return Math.min(parsed, MAX_BATCH_LIMIT);
}

function resolveBatchStatus(items: StoredBatchItem[]) {
  return resolveImageBatchStatusFromItemStatuses(items.map((item) => item.status));
}

function toBatchItemResponse(item: StoredBatchItem): ImageBatchItemResponse {
  return {
    id: item.id,
    batchId: item.batchId,
    index: item.itemIndex,
    provider: item.provider as ProviderId,
    model: item.model,
    mode: item.mode as ImageMode,
    prompt: item.prompt,
    status: item.status as ImageBatchItemResponse["status"],
    jobId: item.jobId ?? undefined,
    resultId: item.resultId ?? undefined,
    imageUrl: item.resultId ? `/api/images/file/${item.resultId}` : undefined,
    thumbnailUrl: item.resultId ? `/api/images/thumb/${item.resultId}` : undefined,
    error: item.error ?? undefined,
    retryCount: item.retryCount,
    createdAt: item.createdAt.toISOString(),
    startedAt: item.startedAt?.toISOString(),
    finishedAt: item.finishedAt?.toISOString()
  };
}

function toBatchResponse(batch: StoredBatch, items?: StoredBatchItem[]): ImageBatchResponse {
  const resolvedItems = items ?? [];
  const successCount = resolvedItems.length > 0
    ? resolvedItems.filter((item) => item.status === "succeeded").length
    : batch.successCount;
  const failedCount = resolvedItems.length > 0
    ? resolvedItems.filter((item) => item.status === "failed").length
    : batch.failedCount;

  return {
    id: batch.id,
    name: batch.name,
    provider: batch.provider as ProviderId,
    model: batch.model,
    mode: batch.mode as ImageMode,
    status: resolvedItems.length > 0 ? resolveBatchStatus(resolvedItems) : batch.status as ImageBatchResponse["status"],
    totalCount: batch.totalCount,
    successCount,
    failedCount,
    promptFormat: batch.promptFormat,
    createdAt: batch.createdAt.toISOString(),
    updatedAt: batch.updatedAt.toISOString(),
    finishedAt: batch.finishedAt?.toISOString()
  };
}

function toBatchDetailResponse(batch: BatchWithItems): ImageBatchDetailResponse {
  return {
    ...toBatchResponse(batch, batch.items),
    items: batch.items.map(toBatchItemResponse)
  };
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || "Batch item failed.");
}

async function readBatchWithItems(userId: string, batchId: string) {
  const batch = await prisma.imageBatch.findFirst({
    where: { id: batchId, userId },
    include: {
      items: {
        orderBy: { itemIndex: "asc" }
      }
    }
  });

  if (!batch) {
    throw new AppError("Batch not found.", 404);
  }

  return batch as unknown as BatchWithItems;
}

export async function recalculateImageBatch(batchId: string) {
  const batch = await prisma.imageBatch.findUnique({
    where: { id: batchId },
    include: { items: true }
  });

  if (!batch) return null;

  const items = batch.items as unknown as StoredBatchItem[];
  const successCount = items.filter((item) => item.status === "succeeded").length;
  const failedCount = items.filter((item) => item.status === "failed").length;
  const status = resolveBatchStatus(items);
  const finished = successCount + failedCount >= batch.totalCount;

  return prisma.imageBatch.update({
    where: { id: batchId },
    data: {
      status,
      successCount,
      failedCount,
      finishedAt: finished ? (batch.finishedAt ?? new Date()) : null
    }
  });
}

export async function createImageBatchForUser(userId: string, input: {
  name?: unknown;
  provider?: unknown;
  model?: unknown;
  mode?: unknown;
  prompts?: unknown;
  promptFormat?: unknown;
}) {
  const provider = typeof input.provider === "string" ? input.provider : "";
  const mode = typeof input.mode === "string" ? input.mode : "";
  const model = typeof input.model === "string" ? input.model.trim() : "";
  const prompts = Array.isArray(input.prompts)
    ? input.prompts.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean)
    : [];

  if (!isProviderId(provider)) {
    throw new AppError("Choose a valid provider.");
  }

  if (!isImageMode(mode)) {
    throw new AppError("Choose a valid generation mode.");
  }

  if (!model) {
    throw new AppError("Choose a model first.");
  }

  if (prompts.length === 0) {
    throw new AppError("Enter at least one prompt.");
  }

  if (prompts.length > MAX_BATCH_PROMPTS) {
    throw new AppError(`Use ${MAX_BATCH_PROMPTS} prompts or fewer.`);
  }

  if (prompts.some((prompt) => prompt.length > MAX_PROMPT_LENGTH)) {
    throw new AppError(`Each prompt must be ${MAX_PROMPT_LENGTH} characters or fewer.`);
  }

  const name = typeof input.name === "string" && input.name.trim()
    ? input.name.trim().slice(0, 80)
    : `Batch ${new Date().toLocaleString("sv-SE")}`;
  const promptFormat = input.promptFormat === "lines" ? "lines" : "blocks";

  const batch = await prisma.$transaction(async (tx) => {
    const created = await tx.imageBatch.create({
      data: {
        userId,
        name,
        provider,
        model,
        mode,
        totalCount: prompts.length,
        promptFormat
      }
    });

    await tx.imageBatchItem.createMany({
      data: prompts.map((prompt, itemIndex) => ({
        batchId: created.id,
        userId,
        itemIndex,
        provider,
        model,
        mode,
        prompt
      }))
    });

    return tx.imageBatch.findUnique({
      where: { id: created.id },
      include: {
        items: {
          orderBy: { itemIndex: "asc" }
        }
      }
    });
  });

  if (!batch) {
    throw new AppError("Batch could not be created.", 500);
  }

  return toBatchDetailResponse(batch as unknown as BatchWithItems);
}

export async function readImageBatchesForUser(userId: string, limitValue?: string | null) {
  const batches = await prisma.imageBatch.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: normalizeLimit(limitValue)
  });

  return {
    batches: (batches as unknown as StoredBatch[]).map((batch) => toBatchResponse(batch))
  };
}

export async function readImageBatchForUser(userId: string, batchId: string) {
  let batch = await readBatchWithItems(userId, batchId);
  if (await expireImageBatchIfTimedOut(userId, batch)) {
    batch = await readBatchWithItems(userId, batchId);
  }

  return toBatchDetailResponse(batch);
}

export async function markBatchItemCreating(userId: string, batchId: string, itemId: string) {
  const updated = await prisma.imageBatchItem.updateMany({
    where: {
      id: itemId,
      batchId,
      userId
    },
    data: {
      status: "creating",
      error: null,
      resultId: null,
      startedAt: null,
      finishedAt: null
    }
  });

  if (updated.count === 0) {
    throw new AppError("Batch item not found.", 404);
  }

  await recalculateImageBatch(batchId);
}

export async function attachJobToBatchItem(userId: string, batchId: string, itemId: string, jobId: string) {
  await prisma.imageBatchItem.updateMany({
    where: {
      id: itemId,
      batchId,
      userId
    },
    data: {
      status: "pending",
      jobId,
      error: null,
      resultId: null,
      startedAt: null,
      finishedAt: null
    }
  });

  await recalculateImageBatch(batchId);
}

export async function markBatchItemRunning(userId: string, batchId: string | null | undefined, itemId: string | null | undefined) {
  if (!batchId || !itemId) return;

  await prisma.imageBatchItem.updateMany({
    where: {
      id: itemId,
      batchId,
      userId
    },
    data: {
      status: "running",
      error: null,
      startedAt: new Date(),
      finishedAt: null
    }
  });

  await recalculateImageBatch(batchId);
}

export async function markBatchItemSucceeded(userId: string, batchId: string | null | undefined, itemId: string | null | undefined, resultId: string) {
  if (!batchId || !itemId) return;

  await prisma.imageBatchItem.updateMany({
    where: {
      id: itemId,
      batchId,
      userId
    },
    data: {
      status: "succeeded",
      resultId,
      error: null,
      finishedAt: new Date()
    }
  });

  await recalculateImageBatch(batchId);
}

export async function markBatchItemFailed(userId: string, batchId: string | null | undefined, itemId: string | null | undefined, error: unknown) {
  if (!batchId || !itemId) return;

  await prisma.imageBatchItem.updateMany({
    where: {
      id: itemId,
      batchId,
      userId
    },
    data: {
      status: "failed",
      error: getErrorMessage(error),
      finishedAt: new Date()
    }
  });

  await recalculateImageBatch(batchId);
}

export async function markBatchItemPaused(userId: string, batchId: string | null | undefined, itemId: string | null | undefined, error?: unknown) {
  if (!batchId || !itemId) return;

  await prisma.imageBatchItem.updateMany({
    where: {
      id: itemId,
      batchId,
      userId
    },
    data: {
      status: "paused",
      error: error === undefined ? null : getErrorMessage(error),
      startedAt: null,
      finishedAt: null
    }
  });

  await recalculateImageBatch(batchId);
}

export async function retryImageBatchItems(userId: string, batchId: string, itemIds?: unknown) {
  const batch = await readBatchWithItems(userId, batchId);
  const requestedIds = Array.isArray(itemIds)
    ? new Set(itemIds.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()))
    : null;
  const failedItems = batch.items.filter((item) => isRetryableBatchItemStatus(item.status) && (!requestedIds || requestedIds.has(item.id)));
  const jobIds: string[] = [];

  for (const item of failedItems) {
    if (!item.jobId) {
      await markBatchItemFailed(userId, batchId, item.id, "No previous job payload is available for retry.");
      continue;
    }

    const previousJob = await prisma.imageJob.findFirst({
      where: {
        id: item.jobId,
        userId
      }
    });

    if (!previousJob) {
      await markBatchItemFailed(userId, batchId, item.id, "Previous job was not found.");
      continue;
    }

    let requestJson = previousJob.requestJson;
    try {
      const parsed = JSON.parse(previousJob.requestJson) as { platformQuotaDate?: unknown };
      if (typeof parsed.platformQuotaDate === "string") {
        parsed.platformQuotaDate = await reservePlatformQuota(userId);
        requestJson = JSON.stringify(parsed);
      }
    } catch {
      // Keep the original payload; the worker will surface payload problems.
    }

    const job = await prisma.imageJob.create({
      data: {
        userId,
        status: "pending",
        provider: item.provider,
        model: item.model,
        mode: item.mode,
        prompt: item.prompt,
        requestJson,
        batchId,
        batchItemId: item.id
      }
    });

    jobIds.push(job.id);

    await prisma.imageBatchItem.update({
      where: { id: item.id },
      data: {
        status: "pending",
        jobId: job.id,
        resultId: null,
        error: null,
        retryCount: { increment: 1 },
        startedAt: null,
        finishedAt: null
      }
    });
  }

  await recalculateImageBatch(batchId);
  return {
    batch: await readImageBatchForUser(userId, batchId),
    jobIds
  };
}
