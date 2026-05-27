import { Worker } from "bullmq";
import type { Job } from "bullmq";
import { prisma } from "../lib/server/db";
import {
  getImageWorkerConnection,
  getImageQueueRuntimeSettings,
  refreshImageQueueRuntimeSettings,
  assertImageQueueConnectionReady,
  IMAGE_QUEUE_NAME,
  isImageQueueEnabled
} from "../lib/server/image-queue";
import type { EffectiveImageQueueSettings } from "../lib/server/image-queue-settings";
import { restorePendingImageJobsToQueue, runClaimedImageJobById } from "../lib/server/image-jobs";
import { getImageWorkerSchemaWaitConfig, isMissingImageJobTableError } from "../lib/image-worker-startup";

type ImageQueuePayload = {
  jobId?: unknown;
};

type RunningImageWorker = {
  worker: Worker<ImageQueuePayload>;
  connection: ReturnType<typeof getImageWorkerConnection>;
  settings: EffectiveImageQueueSettings;
};

const WORKER_CONFIG_POLL_MS = 5000;

function requireRedisQueue() {
  if (!isImageQueueEnabled()) {
    throw new Error("REDIS_URL must be set before starting the image worker.");
  }
}

function getJobId(job: Job<ImageQueuePayload>) {
  const jobId = job.data.jobId;
  if (typeof jobId !== "string" || !jobId.trim()) {
    throw new Error("Queue job payload is missing jobId.");
  }

  return jobId.trim();
}

async function closeRunningWorker(running: RunningImageWorker | null, reason: string) {
  if (!running) return;

  console.log("[image-worker] closing worker", {
    reason,
    queue: IMAGE_QUEUE_NAME,
    prefix: running.settings.imageQueuePrefix,
    concurrency: running.settings.imageWorkerConcurrency,
    configVersion: running.settings.workerRuntimeVersion
  });

  await running.worker.close();
  running.connection.disconnect();
}

async function shutdown(getRunning: () => RunningImageWorker | null, signal: string) {
  console.log(`[image-worker] received ${signal}; closing worker`);
  await closeRunningWorker(getRunning(), signal);
  await prisma.$disconnect();
  process.exit(0);
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function restorePendingImageJobsWhenSchemaReady() {
  const { attempts, delayMs } = getImageWorkerSchemaWaitConfig();

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await restorePendingImageJobsToQueue();
    } catch (error) {
      if (!isMissingImageJobTableError(error) || attempt >= attempts) {
        throw error;
      }

      console.warn("[image-worker] ImageJob table is not ready; waiting for database migrations", {
        attempt,
        attempts,
        retryInMs: delayMs
      });
      await wait(delayMs);
    }
  }

  return 0;
}

async function createRunningWorker(settings: EffectiveImageQueueSettings): Promise<RunningImageWorker> {
  const connection = getImageWorkerConnection();
  const worker = new Worker<ImageQueuePayload>(
    IMAGE_QUEUE_NAME,
    async (job: Job<ImageQueuePayload>) => {
      const jobId = getJobId(job);
      const attemptsRemaining = job.opts.attempts
        ? job.attemptsMade + 1 < job.opts.attempts
        : false;

      console.log("[image-worker] started", {
        bullJobId: job.id,
        imageJobId: jobId,
        attemptsMade: job.attemptsMade,
        attemptsConfigured: job.opts.attempts,
        attemptsRemaining
      });

      await runClaimedImageJobById(jobId, { retryable: attemptsRemaining });
    },
    {
      connection,
      prefix: settings.imageQueuePrefix,
      concurrency: settings.imageWorkerConcurrency
    }
  );

  worker.on("completed", (job: Job<ImageQueuePayload>) => {
    console.log("[image-worker] completed", { bullJobId: job.id, imageJobId: job.data.jobId });
  });

  worker.on("failed", (job: Job<ImageQueuePayload> | undefined, error: Error) => {
    console.error("[image-worker] failed", {
      bullJobId: job?.id,
      imageJobId: job?.data.jobId,
      attemptsMade: job?.attemptsMade,
      cause: error instanceof Error ? error.message : String(error)
    });
  });

  worker.on("error", (error: Error) => {
    console.error("[image-worker] worker error", {
      cause: error instanceof Error ? error.message : String(error)
    });
  });

  await worker.waitUntilReady();
  console.log("[image-worker] ready", {
    queue: IMAGE_QUEUE_NAME,
    prefix: settings.imageQueuePrefix,
    concurrency: settings.imageWorkerConcurrency,
    target: settings.redisTarget,
    configVersion: settings.workerRuntimeVersion
  });

  return {
    worker,
    connection,
    settings
  };
}

async function main() {
  let running: RunningImageWorker | null = null;
  await refreshImageQueueRuntimeSettings({ force: true });
  requireRedisQueue();
  const queueHealth = await assertImageQueueConnectionReady();
  const restoredJobs = await restorePendingImageJobsWhenSchemaReady();
  console.log("[image-worker] redis queue ready", {
    target: queueHealth.target,
    restoredJobs
  });

  running = await createRunningWorker(getImageQueueRuntimeSettings());

  const pollTimer = setInterval(() => {
    void (async () => {
      const nextSettings = await refreshImageQueueRuntimeSettings({ force: true });
      if (running && running.settings.workerRuntimeVersion === nextSettings.workerRuntimeVersion) return;

      if (nextSettings.mode !== "redis" || !nextSettings.redisConfigured) {
        console.error("[image-worker] queue configuration no longer enables Redis; worker is waiting for a valid Redis configuration", {
          mode: nextSettings.mode,
          target: nextSettings.redisTarget,
          configVersion: nextSettings.workerRuntimeVersion
        });
        await closeRunningWorker(running, "configuration-disabled");
        running = null;
        return;
      }

      console.log("[image-worker] queue configuration changed; rebuilding worker", {
        previousVersion: running?.settings.workerRuntimeVersion,
        nextVersion: nextSettings.workerRuntimeVersion
      });
      await closeRunningWorker(running, "configuration-changed");
      running = await createRunningWorker(nextSettings);
    })().catch((error) => {
      console.error("[image-worker] worker configuration poll failed", {
        cause: error instanceof Error ? error.message : String(error)
      });
    });
  }, WORKER_CONFIG_POLL_MS);
  (pollTimer as { unref?: () => void }).unref?.();

  process.on("SIGINT", () => void shutdown(() => running, "SIGINT"));
  process.on("SIGTERM", () => void shutdown(() => running, "SIGTERM"));
}

void main().catch(async (error) => {
  console.error("[image-worker] startup failed", {
    cause: error instanceof Error ? error.message : String(error)
  });
  await prisma.$disconnect();
  process.exit(1);
});
