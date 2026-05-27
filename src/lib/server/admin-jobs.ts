import { isForceKillableImageJobStatus, isPausableImageJobStatus, isResumableImageJobStatus, isRetryableImageJobStatus } from "../image-job-state";
import type { CreateImageJobResponse, ImageJobResponse } from "../types";
import { writeAdminAuditLog } from "./admin-audit";
import { retryImageBatchItems } from "./batches";
import { prisma } from "./db";
import { AppError } from "./errors";
import {
  forceKillImageJobForUser,
  pauseImageJobForUser,
  resumeImageJobForUser,
  retryImageJobForUser,
  scheduleImageJob
} from "./image-jobs";

const DEFAULT_ADMIN_JOBS_LIMIT = 30;
const MAX_ADMIN_JOBS_LIMIT = 100;
const MAX_ADMIN_JOB_ACTION_IDS = 50;

type AdminJobAction = "pause" | "resume" | "kill" | "retry";

type AdminJobWithUser = {
  id: string;
  userId: string;
  status: string;
  provider: string;
  model: string;
  mode: string;
  prompt: string;
  batchId: string | null;
  batchItemId: string | null;
  resultId: string | null;
  error: string | null;
  failureCode: string | null;
  failureCategory: string | null;
  retryCount: number;
  adminActionBy: string | null;
  adminActionAt: Date | null;
  lockedBy: string | null;
  heartbeatAt: Date | null;
  queueWaitMs: number | null;
  executionMs: number | null;
  upstreamMs: number | null;
  fileSaveMs: number | null;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  user: {
    email: string;
  };
};

export type AdminJobRecord = {
  id: string;
  userId: string;
  userEmail: string;
  status: string;
  provider: string;
  model: string;
  mode: string;
  prompt: string;
  batchId?: string;
  batchItemId?: string;
  resultId?: string;
  error?: string;
  failureCode?: string;
  failureCategory?: string;
  retryCount: number;
  adminActionBy?: string;
  adminActionAt?: string;
  lockedBy?: string;
  heartbeatAt?: string;
  queueWaitMs?: number;
  executionMs?: number;
  upstreamMs?: number;
  fileSaveMs?: number;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
};

export type AdminJobsResponse = {
  records: AdminJobRecord[];
  nextCursor?: string;
};

function normalizeAdminJobsLimit(value: string | null | undefined) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return DEFAULT_ADMIN_JOBS_LIMIT;
  return Math.min(Math.max(parsed, 1), MAX_ADMIN_JOBS_LIMIT);
}

function parseDate(value: string | null | undefined) {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function encodeAdminJobsCursor(job: Pick<AdminJobWithUser, "createdAt" | "id">) {
  return Buffer.from(JSON.stringify({
    createdAt: job.createdAt.toISOString(),
    id: job.id
  })).toString("base64url");
}

function decodeAdminJobsCursor(cursor: string | null | undefined) {
  if (!cursor) return null;

  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
      createdAt?: unknown;
      id?: unknown;
    };
    const createdAt = typeof parsed.createdAt === "string" ? new Date(parsed.createdAt) : null;
    if (!createdAt || Number.isNaN(createdAt.getTime()) || typeof parsed.id !== "string") {
      throw new Error("Invalid cursor.");
    }

    return {
      createdAt,
      id: parsed.id
    };
  } catch {
    throw new AppError("Invalid jobs cursor.");
  }
}

function sanitizeJobError(error: string | null | undefined) {
  if (!error) return undefined;

  return error
    .replace(/(https?:\/\/)([^:@/\s]+):([^@/\s]+)@/gi, "$1[redacted]@")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[redacted-api-key]")
    .replace(/\b(redis:\/\/)([^:@/\s]+):([^@/\s]+)@/gi, "$1[redacted]@")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

function toAdminJobRecord(job: AdminJobWithUser): AdminJobRecord {
  return {
    id: job.id,
    userId: job.userId,
    userEmail: job.user.email,
    status: job.status,
    provider: job.provider,
    model: job.model,
    mode: job.mode,
    prompt: job.prompt,
    batchId: job.batchId ?? undefined,
    batchItemId: job.batchItemId ?? undefined,
    resultId: job.resultId ?? undefined,
    error: sanitizeJobError(job.error),
    failureCode: job.failureCode ?? undefined,
    failureCategory: job.failureCategory ?? undefined,
    retryCount: job.retryCount,
    adminActionBy: job.adminActionBy ?? undefined,
    adminActionAt: job.adminActionAt?.toISOString(),
    lockedBy: job.lockedBy ?? undefined,
    heartbeatAt: job.heartbeatAt?.toISOString(),
    queueWaitMs: job.queueWaitMs ?? undefined,
    executionMs: job.executionMs ?? undefined,
    upstreamMs: job.upstreamMs ?? undefined,
    fileSaveMs: job.fileSaveMs ?? undefined,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    startedAt: job.startedAt?.toISOString(),
    finishedAt: job.finishedAt?.toISOString()
  };
}

function normalizeAdminJobIds(value: unknown) {
  if (!Array.isArray(value)) {
    throw new AppError("Choose at least one job.");
  }

  const ids = Array.from(new Set(value.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean)));
  if (ids.length === 0) {
    throw new AppError("Choose at least one job.");
  }

  if (ids.length > MAX_ADMIN_JOB_ACTION_IDS) {
    throw new AppError(`Operate on at most ${MAX_ADMIN_JOB_ACTION_IDS} jobs at a time.`);
  }

  return ids;
}

async function readActionJobs(jobIds: string[]) {
  const jobs = await prisma.imageJob.findMany({
    where: {
      id: { in: jobIds }
    },
    include: {
      user: {
        select: {
          email: true
        }
      }
    }
  });

  if (jobs.length !== jobIds.length) {
    throw new AppError("One or more jobs were not found.", 404);
  }

  const statuses = new Set(jobs.map((job) => job.status));
  if (statuses.size > 1) {
    throw new AppError("Batch operations must target jobs with the same status.", 409);
  }

  return jobs as unknown as AdminJobWithUser[];
}

function assertAdminJobActionAllowed(action: AdminJobAction, status: string) {
  if (action === "pause" && !isPausableImageJobStatus(status)) {
    throw new AppError("Only pending jobs can be paused.", 409);
  }

  if (action === "resume" && !isResumableImageJobStatus(status)) {
    throw new AppError("Only paused jobs can be resumed.", 409);
  }

  if (action === "kill" && !isForceKillableImageJobStatus(status)) {
    throw new AppError("Only unfinished jobs can be force killed.", 409);
  }

  if (action === "retry" && status !== "pending" && status !== "paused" && !isRetryableImageJobStatus(status)) {
    throw new AppError("Only pending, paused, or failed jobs can be retried.", 409);
  }
}

async function markAdminAction(jobId: string, adminUserId: string, input: {
  retry?: boolean;
}) {
  await prisma.imageJob.updateMany({
    where: { id: jobId },
    data: {
      adminActionBy: adminUserId,
      adminActionAt: new Date(),
      ...(input.retry ? { retryCount: { increment: 1 } } : {})
    }
  });
}

async function runAdminRetry(job: AdminJobWithUser, adminUserId: string) {
  const scheduledJobIds: string[] = [];
  let result: ImageJobResponse | CreateImageJobResponse | null = null;

  if (job.status === "pending") {
    await scheduleImageJob(job.id);
    await markAdminAction(job.id, adminUserId, { retry: true });
    scheduledJobIds.push(job.id);
  } else if (job.status === "paused") {
    result = await resumeImageJobForUser(job.userId, job.id);
    await markAdminAction(job.id, adminUserId, { retry: true });
    scheduledJobIds.push(job.id);
  } else if (job.batchId && job.batchItemId) {
    const retryResult = await retryImageBatchItems(job.userId, job.batchId, [job.batchItemId]);
    await Promise.all(retryResult.jobIds.map((jobId) => scheduleImageJob(jobId)));
    await markAdminAction(job.id, adminUserId, { retry: true });
    scheduledJobIds.push(...retryResult.jobIds);
  } else {
    result = await retryImageJobForUser(job.userId, job.id);
    await scheduleImageJob(result.jobId);
    await markAdminAction(job.id, adminUserId, { retry: true });
    await markAdminAction(result.jobId, adminUserId, { retry: false });
    scheduledJobIds.push(result.jobId);
  }

  return {
    result,
    scheduledJobIds
  };
}

export async function readAdminJobs(input: {
  limit?: string | null;
  cursor?: string | null;
  status?: string | null;
  userId?: string | null;
  provider?: string | null;
  model?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  q?: string | null;
}): Promise<AdminJobsResponse> {
  const limit = normalizeAdminJobsLimit(input.limit);
  const cursor = decodeAdminJobsCursor(input.cursor);
  const status = input.status?.trim();
  const userId = input.userId?.trim();
  const provider = input.provider?.trim();
  const model = input.model?.trim();
  const q = input.q?.trim();
  const dateFrom = parseDate(input.dateFrom);
  const dateTo = parseDate(input.dateTo);
  const jobs = await prisma.imageJob.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(userId ? { userId } : {}),
      ...(provider ? { provider } : {}),
      ...(model ? { model: { contains: model } } : {}),
      ...(q ? {
        OR: [
          { prompt: { contains: q } },
          { error: { contains: q } },
          { model: { contains: q } }
        ]
      } : {}),
      ...(dateFrom || dateTo ? {
        createdAt: {
          ...(dateFrom ? { gte: dateFrom } : {}),
          ...(dateTo ? { lte: dateTo } : {})
        }
      } : {}),
      ...(cursor ? {
        OR: [
          { createdAt: { lt: cursor.createdAt } },
          {
            createdAt: cursor.createdAt,
            id: { lt: cursor.id }
          }
        ]
      } : {})
    },
    orderBy: [
      { createdAt: "desc" },
      { id: "desc" }
    ],
    take: limit + 1,
    include: {
      user: {
        select: {
          email: true
        }
      }
    }
  });
  const page = jobs.slice(0, limit) as unknown as AdminJobWithUser[];

  return {
    records: page.map(toAdminJobRecord),
    nextCursor: jobs.length > limit && page.length > 0 ? encodeAdminJobsCursor(page[page.length - 1]) : undefined
  };
}

export async function runAdminJobAction(input: {
  adminUserId: string;
  action: AdminJobAction;
  jobIds: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  const jobIds = normalizeAdminJobIds(input.jobIds);
  const jobs = await readActionJobs(jobIds);
  const sourceStatus = jobs[0]?.status ?? "";
  assertAdminJobActionAllowed(input.action, sourceStatus);

  const results: Array<ImageJobResponse | CreateImageJobResponse | null> = [];
  const scheduledJobIds: string[] = [];

  for (const job of jobs) {
    if (input.action === "pause") {
      results.push(await pauseImageJobForUser(job.userId, job.id));
      await markAdminAction(job.id, input.adminUserId, { retry: false });
    } else if (input.action === "resume") {
      results.push(await resumeImageJobForUser(job.userId, job.id));
      await markAdminAction(job.id, input.adminUserId, { retry: false });
    } else if (input.action === "kill") {
      results.push(await forceKillImageJobForUser(job.userId, job.id));
      await markAdminAction(job.id, input.adminUserId, { retry: false });
    } else {
      const retryResult = await runAdminRetry(job, input.adminUserId);
      results.push(retryResult.result);
      scheduledJobIds.push(...retryResult.scheduledJobIds);
    }
  }

  await writeAdminAuditLog({
    adminUserId: input.adminUserId,
    action: `job.${input.action}`,
    targetType: "image-job",
    targetId: jobIds.length === 1 ? jobIds[0] : null,
    metadata: {
      count: jobIds.length,
      sourceStatus,
      jobIds: jobIds.join(","),
      userIds: Array.from(new Set(jobs.map((job) => job.userId))).join(","),
      scheduledJobIds: scheduledJobIds.join(",")
    },
    ipAddress: input.ipAddress,
    userAgent: input.userAgent
  });

  return {
    ok: true,
    action: input.action,
    count: jobs.length,
    scheduledJobIds,
    results
  };
}
