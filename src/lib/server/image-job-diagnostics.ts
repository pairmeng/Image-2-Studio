import type { EffectiveImageQueueSettings } from "./image-queue-settings";
import { classifyImageJobFailure, getImageJobFailureLabel } from "./image-job-failures";

type DiagnosticImageJob = {
  provider: string;
  model: string;
  status: string;
  error: string | null;
  failureCategory?: string | null;
  queueWaitMs: number | null;
  executionMs: number | null;
  upstreamMs: number | null;
  fileSaveMs: number | null;
  createdAt: Date;
  updatedAt: Date;
};

type DiagnosticsImageJobClient = {
  count(input: { where?: Record<string, unknown> }): Promise<number>;
  findMany(input: { where?: Record<string, unknown>; orderBy?: Record<string, unknown>; take?: number }): Promise<DiagnosticImageJob[]>;
};

type ImageQueueConnectionSnapshot = {
  enabled: boolean;
  ok: boolean;
  target: string;
  error?: string;
};

type ImageQueueJobCounts = {
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  completed: number;
};

export type ImageJobQueueSnapshot = {
  workerId: string;
  backend: "redis" | "inline";
  configSource: EffectiveImageQueueSettings["source"];
  configVersion: string;
  queueRuntimeVersion: string;
  workerRuntimeVersion: string;
  queue: ImageQueueConnectionSnapshot;
  bullmq: ImageQueueJobCounts;
  redisTarget: string;
  redisConfigured: boolean;
  queuePrefix: string;
  attempts: number;
  backoffMs: number;
  concurrency: number;
  userConcurrency: number;
  workerConcurrency: number;
  active: number;
  queued: number;
  pending: number;
  running: number;
  recentFailed: number;
  recentSucceeded: number;
  recent: {
    inspected: number;
    averageQueueWaitMs: number | null;
    averageExecutionMs: number | null;
    averageUpstreamMs: number | null;
    averageFileSaveMs: number | null;
  };
  providerHealth: Array<{
    provider: string;
    status: "healthy" | "degraded" | "failing" | "idle";
    total: number;
    succeeded: number;
    failed: number;
    failureRate: number;
    averageExecutionMs: number | null;
    averageUpstreamMs: number | null;
  }>;
  modelUsage: Array<{
    provider: string;
    model: string;
    total: number;
    succeeded: number;
    failed: number;
    averageExecutionMs: number | null;
  }>;
  failureReasons: Array<{
    reason: string;
    count: number;
    sample: string;
    latestAt: string;
  }>;
};

type ImageJobQueueSnapshotDeps = {
  workerId: string;
  activeCount: number;
  recentStatsMs: number;
  imageJobClient: DiagnosticsImageJobClient;
  ensureInlineImageJobScheduler: () => void;
  isRedisQueueEnabled: () => boolean;
  checkImageQueueConnection: () => Promise<ImageQueueConnectionSnapshot>;
  getImageQueueJobCounts: () => Promise<ImageQueueJobCounts>;
  getInlineConcurrency: () => number;
  getInlineUserConcurrency: (globalConcurrency?: number) => number;
  getRedisWorkerConcurrency: () => number;
  getQueueRuntimeSettings: () => EffectiveImageQueueSettings;
};

function averageNullable(values: Array<number | null>) {
  const numericValues = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (numericValues.length === 0) return null;

  return Math.round(numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length);
}

function getFailureRate(failed: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((failed / total) * 100);
}

function getProviderHealthStatus(total: number, failed: number): "healthy" | "degraded" | "failing" | "idle" {
  if (total === 0) return "idle";

  const failureRate = failed / total;
  if (total >= 3 && failureRate >= 0.5) return "failing";
  if (failed > 0 || failureRate >= 0.2) return "degraded";

  return "healthy";
}

function getFailureReason(job: Pick<DiagnosticImageJob, "error" | "failureCategory">) {
  return job.failureCategory
    ? getImageJobFailureLabel(job.failureCategory)
    : classifyImageJobFailure(job.error).label;
}

function getFailureSample(error: string | null | undefined) {
  const normalized = (error ?? "No error message").replace(/\s+/g, " ").trim();
  return normalized.length > 140 ? `${normalized.slice(0, 137)}...` : normalized;
}

function getRecentDiagnostics(recentJobs: DiagnosticImageJob[]) {
  const providerMap = new Map<string, DiagnosticImageJob[]>();
  const modelMap = new Map<string, DiagnosticImageJob[]>();
  const failureMap = new Map<string, { count: number; sample: string; latestAt: Date }>();

  for (const job of recentJobs) {
    const providerJobs = providerMap.get(job.provider) ?? [];
    providerJobs.push(job);
    providerMap.set(job.provider, providerJobs);

    const modelKey = `${job.provider}:${job.model}`;
    const modelJobs = modelMap.get(modelKey) ?? [];
    modelJobs.push(job);
    modelMap.set(modelKey, modelJobs);

    if (job.status === "failed") {
      const reason = getFailureReason(job);
      const current = failureMap.get(reason);
      const latestAt = job.updatedAt ?? job.createdAt;

      if (current) {
        current.count += 1;
        if (latestAt > current.latestAt) {
          current.sample = getFailureSample(job.error);
          current.latestAt = latestAt;
        }
      } else {
        failureMap.set(reason, {
          count: 1,
          sample: getFailureSample(job.error),
          latestAt
        });
      }
    }
  }

  const providerHealth = Array.from(providerMap.entries())
    .map(([provider, jobs]) => {
      const succeeded = jobs.filter((job) => job.status === "succeeded").length;
      const failed = jobs.filter((job) => job.status === "failed").length;

      return {
        provider,
        status: getProviderHealthStatus(jobs.length, failed),
        total: jobs.length,
        succeeded,
        failed,
        failureRate: getFailureRate(failed, jobs.length),
        averageExecutionMs: averageNullable(jobs.map((job) => job.executionMs)),
        averageUpstreamMs: averageNullable(jobs.map((job) => job.upstreamMs))
      };
    })
    .sort((left, right) => right.total - left.total || right.failed - left.failed);

  const modelUsage = Array.from(modelMap.entries())
    .map(([key, jobs]) => {
      const [provider, ...modelParts] = key.split(":");
      const model = modelParts.join(":");
      const succeeded = jobs.filter((job) => job.status === "succeeded").length;
      const failed = jobs.filter((job) => job.status === "failed").length;

      return {
        provider,
        model,
        total: jobs.length,
        succeeded,
        failed,
        averageExecutionMs: averageNullable(jobs.map((job) => job.executionMs))
      };
    })
    .sort((left, right) => right.total - left.total || right.failed - left.failed)
    .slice(0, 8);

  const failureReasons = Array.from(failureMap.entries())
    .map(([reason, item]) => ({
      reason,
      count: item.count,
      sample: item.sample,
      latestAt: item.latestAt.toISOString()
    }))
    .sort((left, right) => right.count - left.count || right.latestAt.localeCompare(left.latestAt))
    .slice(0, 8);

  return {
    providerHealth,
    modelUsage,
    failureReasons
  };
}

export async function getImageJobQueueSnapshotFromDeps({
  workerId,
  activeCount,
  recentStatsMs,
  imageJobClient,
  ensureInlineImageJobScheduler,
  isRedisQueueEnabled,
  checkImageQueueConnection,
  getImageQueueJobCounts,
  getInlineConcurrency,
  getInlineUserConcurrency,
  getRedisWorkerConcurrency,
  getQueueRuntimeSettings
}: ImageJobQueueSnapshotDeps): Promise<ImageJobQueueSnapshot> {
  ensureInlineImageJobScheduler();

  const recentCutoff = new Date(Date.now() - recentStatsMs);
  const [pending, running, recentFailed, recentSucceeded, recentJobs] = await Promise.all([
    imageJobClient.count({ where: { status: "pending" } }),
    imageJobClient.count({ where: { status: "running" } }),
    imageJobClient.count({ where: { status: "failed", updatedAt: { gte: recentCutoff } } }),
    imageJobClient.count({ where: { status: "succeeded", updatedAt: { gte: recentCutoff } } }),
    imageJobClient.findMany({
      where: {
        status: {
          in: ["succeeded", "failed"]
        },
        updatedAt: {
          gte: recentCutoff
        }
      },
      orderBy: {
        updatedAt: "desc"
      },
      take: 200
    })
  ]);

  const settings = getQueueRuntimeSettings();
  const concurrency = getInlineConcurrency();
  const diagnostics = getRecentDiagnostics(recentJobs);
  const redisEnabled = isRedisQueueEnabled();
  const queue = await checkImageQueueConnection();
  const bullmq = redisEnabled && queue.ok
    ? await getImageQueueJobCounts().catch((error) => {
        console.warn("[images/jobs] redis queue counts could not be read", {
          cause: error instanceof Error ? error.message : String(error)
        });
        return {
          waiting: 0,
          active: 0,
          delayed: 0,
          failed: 0,
          completed: 0
        };
      })
    : {
        waiting: 0,
        active: 0,
        delayed: 0,
        failed: 0,
        completed: 0
      };

  return {
    workerId,
    backend: redisEnabled ? "redis" : "inline",
    configSource: settings.source,
    configVersion: settings.version,
    queueRuntimeVersion: settings.queueRuntimeVersion,
    workerRuntimeVersion: settings.workerRuntimeVersion,
    queue,
    bullmq,
    redisTarget: settings.redisTarget,
    redisConfigured: settings.redisConfigured,
    queuePrefix: settings.imageQueuePrefix,
    attempts: settings.imageQueueAttempts,
    backoffMs: settings.imageQueueBackoffMs,
    concurrency: redisEnabled ? getRedisWorkerConcurrency() : concurrency,
    userConcurrency: redisEnabled ? getRedisWorkerConcurrency() : getInlineUserConcurrency(concurrency),
    workerConcurrency: settings.imageWorkerConcurrency,
    active: activeCount,
    queued: pending,
    pending,
    running,
    recentFailed,
    recentSucceeded,
    recent: {
      inspected: recentJobs.length,
      averageQueueWaitMs: averageNullable(recentJobs.map((job) => job.queueWaitMs)),
      averageExecutionMs: averageNullable(recentJobs.map((job) => job.executionMs)),
      averageUpstreamMs: averageNullable(recentJobs.map((job) => job.upstreamMs)),
      averageFileSaveMs: averageNullable(recentJobs.map((job) => job.fileSaveMs))
    },
    ...diagnostics
  };
}
