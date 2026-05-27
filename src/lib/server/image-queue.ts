import { Queue } from "bullmq";
import type { JobsOptions, QueueOptions } from "bullmq";
import IORedis from "ioredis";
import {
  getCachedImageQueueSettings,
  refreshImageQueueSettings,
  type EffectiveImageQueueSettings
} from "./image-queue-settings";

export const IMAGE_QUEUE_NAME = "image-jobs";

type ImageQueuePayload = {
  jobId: string;
};

let imageQueue: Queue<ImageQueuePayload> | null = null;
let imageQueueConnection: IORedis | null = null;
let imageQueueRuntimeVersion = "";
const REDIS_ERROR_LOG_THROTTLE_MS = 30 * 1000;
const redisErrorLogTimestamps = new Map<string, number>();

function getRedisUrl() {
  return getCachedImageQueueSettings().redisUrl;
}

function getQueueSettings() {
  return getCachedImageQueueSettings();
}

export async function refreshImageQueueRuntimeSettings(options: { force?: boolean } = {}) {
  const settings = await refreshImageQueueSettings(options);
  if (imageQueueRuntimeVersion && imageQueueRuntimeVersion !== settings.queueRuntimeVersion) {
    await closeImageQueue();
  }
  return settings;
}

export function getImageQueueRedisTarget() {
  return getQueueSettings().redisTarget;
}

function getImageQueueRedisOptions() {
  return {
    maxRetriesPerRequest: 1,
    enableReadyCheck: true,
    enableOfflineQueue: false
  } as const;
}

function getImageWorkerRedisOptions() {
  return {
    maxRetriesPerRequest: null,
    enableReadyCheck: false
  } as const;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function logRedisConnectionError(scope: string, error: unknown) {
  const cause = getErrorMessage(error);
  const key = `${scope}:${cause}`;
  const now = Date.now();
  const lastLoggedAt = redisErrorLogTimestamps.get(key) ?? 0;
  if (now - lastLoggedAt < REDIS_ERROR_LOG_THROTTLE_MS) return;

  redisErrorLogTimestamps.set(key, now);
  console.error("[image-queue] redis connection error", {
    scope,
    target: getImageQueueRedisTarget(),
    cause
  });
}

function attachRedisErrorHandler(
  connection: IORedis,
  scope: string,
  options: { log?: boolean } = {}
) {
  connection.on("error", (error: Error) => {
    if (options.log === false) return;
    logRedisConnectionError(scope, error);
  });

  return connection;
}

export function isImageQueueEnabled() {
  const settings = getQueueSettings();
  return settings.mode === "redis" && settings.redisConfigured;
}

export function getImageQueuePrefix() {
  return getQueueSettings().imageQueuePrefix;
}

export function getImageQueueAttempts() {
  return getQueueSettings().imageQueueAttempts;
}

export function getImageQueueBackoffMs() {
  return getQueueSettings().imageQueueBackoffMs;
}

export function getImageWorkerConcurrency() {
  return getQueueSettings().imageWorkerConcurrency;
}

export function getImageQueueConnection() {
  const settings = getQueueSettings();
  const redisUrl = settings.redisUrl;
  if (!redisUrl) {
    throw new Error("REDIS_URL must be set to use the image job queue.");
  }

  if (imageQueueRuntimeVersion && imageQueueRuntimeVersion !== settings.queueRuntimeVersion) {
    void closeImageQueue();
  }

  if (!imageQueueConnection) {
    imageQueueConnection = attachRedisErrorHandler(
      new IORedis(redisUrl, getImageQueueRedisOptions()),
      "queue"
    );
  }

  return imageQueueConnection;
}

export function getImageWorkerConnection() {
  const redisUrl = getQueueSettings().redisUrl;
  if (!redisUrl) {
    throw new Error("REDIS_URL must be set to use the image worker.");
  }

  return attachRedisErrorHandler(
    new IORedis(redisUrl, getImageWorkerRedisOptions()),
    "worker"
  );
}

export function getImageQueueOptions(): QueueOptions {
  return {
    connection: getImageQueueConnection(),
    prefix: getImageQueuePrefix()
  };
}

export function getImageQueueJobOptions(): JobsOptions {
  return {
    attempts: getImageQueueAttempts(),
    backoff: {
      type: "exponential",
      delay: getImageQueueBackoffMs()
    },
    removeOnComplete: {
      age: 24 * 60 * 60,
      count: 5000
    },
    removeOnFail: {
      age: 7 * 24 * 60 * 60,
      count: 10000
    }
  };
}

export function getImageQueue() {
  const settings = getQueueSettings();
  if (imageQueue && imageQueueRuntimeVersion && imageQueueRuntimeVersion !== settings.queueRuntimeVersion) {
    void closeImageQueue();
  }

  if (!imageQueue) {
    imageQueue = new Queue<ImageQueuePayload>(IMAGE_QUEUE_NAME, getImageQueueOptions());
    imageQueueRuntimeVersion = settings.queueRuntimeVersion;
    imageQueue.on("error", (error: Error) => {
      logRedisConnectionError("queue", error);
    });
  }

  return imageQueue;
}

export async function closeImageQueue() {
  const queue = imageQueue;
  const connection = imageQueueConnection;
  imageQueue = null;
  imageQueueConnection = null;
  imageQueueRuntimeVersion = "";

  await Promise.allSettled([
    queue?.close(),
    connection?.quit()
  ]);
}

export function getImageQueueRuntimeSettings(): EffectiveImageQueueSettings {
  return getQueueSettings();
}

export async function checkImageQueueConnection() {
  await refreshImageQueueRuntimeSettings();
  if (!isImageQueueEnabled()) {
    return {
      enabled: false,
      ok: true,
      target: getImageQueueRedisTarget()
    };
  }

  const connection = attachRedisErrorHandler(
    new IORedis(getRedisUrl(), {
      ...getImageQueueRedisOptions(),
      enableReadyCheck: false,
      lazyConnect: true,
      retryStrategy: () => undefined
    }),
    "health",
    { log: false }
  );

  try {
    await connection.connect();
    await connection.ping();
    await connection.info();
    return {
      enabled: true,
      ok: true,
      target: getImageQueueRedisTarget()
    };
  } catch (error) {
    return {
      enabled: true,
      ok: false,
      target: getImageQueueRedisTarget(),
      error: getErrorMessage(error)
    };
  } finally {
    connection.disconnect();
  }
}

export async function assertImageQueueConnectionReady() {
  const health = await checkImageQueueConnection();
  if (!health.ok) {
    throw new Error(`Redis queue is not reachable at ${health.target}: ${health.error ?? "unknown error"}`);
  }

  return health;
}

export async function getImageQueueJobCounts() {
  await refreshImageQueueRuntimeSettings();
  if (!isImageQueueEnabled()) {
    return {
      waiting: 0,
      active: 0,
      delayed: 0,
      failed: 0,
      completed: 0
    };
  }

  const counts = await getImageQueue().getJobCounts("waiting", "active", "delayed", "failed", "completed");
  return {
    waiting: counts.waiting ?? 0,
    active: counts.active ?? 0,
    delayed: counts.delayed ?? 0,
    failed: counts.failed ?? 0,
    completed: counts.completed ?? 0
  };
}

export async function removeQueuedImageJob(jobId: string) {
  await refreshImageQueueRuntimeSettings();
  if (!isImageQueueEnabled()) return false;

  const job = await getImageQueue().getJob(jobId);
  if (!job) return false;

  await job.remove();
  return true;
}

export async function enqueueImageJob(jobId: string) {
  await refreshImageQueueRuntimeSettings();
  if (!isImageQueueEnabled()) return false;

  const queue = getImageQueue();
  const existingJob = await queue.getJob(jobId);
  if (existingJob) {
    const state = await existingJob.getState();
    if (state === "completed" || state === "failed") {
      await existingJob.remove();
    } else {
      return true;
    }
  }

  await queue.add(
    "generate",
    { jobId },
    {
      ...getImageQueueJobOptions(),
      jobId
    }
  );

  return true;
}
