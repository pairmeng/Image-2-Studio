import type { ImageBatchDetailResponse } from "../types";
import { prisma } from "./db";
import { AppError } from "./errors";
import { pauseImageJobForUser, resumeImageJobForUser } from "./image-jobs";
import { readImageBatchForUser, recalculateImageBatch } from "./batches";

type BatchActionItem = {
  id: string;
  status: string;
  jobId: string | null;
};

async function readBatchItemsForAction(userId: string, batchId: string) {
  const batch = await prisma.imageBatch.findFirst({
    where: {
      id: batchId,
      userId
    },
    include: {
      items: {
        orderBy: {
          itemIndex: "asc"
        }
      }
    }
  });

  if (!batch) {
    throw new AppError("Batch not found.", 404);
  }

  return batch.items as BatchActionItem[];
}

export async function pauseImageBatchForUser(userId: string, batchId: string): Promise<ImageBatchDetailResponse> {
  const items = await readBatchItemsForAction(userId, batchId);

  for (const item of items) {
    if (item.status === "pending" && item.jobId) {
      await pauseImageJobForUser(userId, item.jobId);
    } else if ((item.status === "queued" || item.status === "creating") && !item.jobId) {
      await prisma.imageBatchItem.updateMany({
        where: {
          id: item.id,
          batchId,
          userId
        },
        data: {
          status: "paused",
          error: null,
          startedAt: null,
          finishedAt: null
        }
      });
    }
  }

  await recalculateImageBatch(batchId);
  return readImageBatchForUser(userId, batchId);
}

export async function resumeImageBatchForUser(userId: string, batchId: string): Promise<ImageBatchDetailResponse> {
  const items = await readBatchItemsForAction(userId, batchId);

  for (const item of items) {
    if (item.status === "paused" && item.jobId) {
      await resumeImageJobForUser(userId, item.jobId);
    } else if (item.status === "paused" && !item.jobId) {
      await prisma.imageBatchItem.updateMany({
        where: {
          id: item.id,
          batchId,
          userId
        },
        data: {
          status: "queued",
          error: null,
          startedAt: null,
          finishedAt: null
        }
      });
    }
  }

  await recalculateImageBatch(batchId);
  return readImageBatchForUser(userId, batchId);
}
