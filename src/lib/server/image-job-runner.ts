import { randomUUID } from "node:crypto";
import { isProviderId, modelSupports, type ImageMode, type ProviderId } from "../models";
import { shouldIgnoreImageJobProviderResult } from "../image-job-runner";
import { AppError } from "./errors";
import { classifyImageJobFailure } from "./image-job-failures";
import { saveGeneratedImage } from "./files";
import { appendHistory } from "./history";
import {
  assertModelOptions,
  assertOfficialOpenAiSize,
  isOpenAiCompatibleGateway,
  loadInputImages,
  parseJobRequest,
  resolveModelForJob,
  validateModelRequest
} from "./image-job-input";
import { getResolvedProviderConfig } from "./provider-config";
import { getProvider } from "./providers";

const IMAGE_JOB_HEARTBEAT_INTERVAL_MS = 15 * 1000;

type ProviderSource = "user" | "platform" | "env" | "none";

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

type ImageJobRunnerClient = {
  findUnique(input: { where: { id: string } }): Promise<StoredImageJob | null>;
  updateMany(input: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
};

type NormalizedCreateError = {
  message: string;
  status: number;
  kind: "app" | "upstream" | "upstream-timeout";
};

type CreateErrorContext = {
  size?: string;
  resolution?: string;
};

export type RunImageJobOptions = {
  retryable?: boolean;
};

type ImageJobRunnerDeps = {
  workerId: string;
  imageJobClient: ImageJobRunnerClient;
  markBatchItemRunning: (userId: string, batchId: string | null, batchItemId: string | null) => Promise<unknown>;
  markBatchItemSucceeded: (userId: string, batchId: string | null, batchItemId: string | null, resultId: string) => Promise<unknown>;
  markBatchItemFailed: (userId: string, batchId: string | null, batchItemId: string | null, error: unknown) => Promise<unknown>;
  attachJobToBatchItem: (userId: string, batchId: string, batchItemId: string, jobId: string) => Promise<unknown>;
  refundJobPlatformQuota: (job: StoredImageJob) => Promise<unknown>;
};

export class RetryableImageJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetryableImageJobError";
  }
}

function unrefTimer(timer: ReturnType<typeof setInterval>) {
  (timer as { unref?: () => void }).unref?.();
}

function getErrorStatus(error: unknown) {
  if (!error || typeof error !== "object") return undefined;

  const status = (error as { status?: unknown }).status;
  if (typeof status === "number") return status;

  const code = (error as { code?: unknown }).code;
  if (typeof code === "number") return code;

  return undefined;
}

function getUpstreamErrorDetails(error: unknown) {
  if (!error || typeof error !== "object") return undefined;

  const source = error as {
    code?: unknown;
    error?: unknown;
    headers?: unknown;
    param?: unknown;
    request_id?: unknown;
    type?: unknown;
  };

  return {
    code: typeof source.code === "string" ? source.code : undefined,
    type: typeof source.type === "string" ? source.type : undefined,
    param: typeof source.param === "string" ? source.param : undefined,
    requestId: typeof source.request_id === "string" ? source.request_id : undefined,
    body: source.error && typeof source.error === "object" ? source.error : undefined
  };
}

function getBaseUrlHost(baseUrl: string) {
  if (!baseUrl) return "default";

  try {
    return new URL(baseUrl).host;
  } catch {
    return "invalid";
  }
}

function isUpstreamTimeout(status: number | undefined, message: string) {
  return status === 408
    || status === 504
    || status === 524
    || /524|504|gateway time-out|gateway timeout|proxy read timeout|read timeout|timed out|timeout|took too long to respond/i.test(message);
}

function isHighResolutionRequest(context?: CreateErrorContext) {
  return context?.resolution === "4096" || /(^|x)4096(x|$)/.test(context?.size ?? "");
}

function normalizeCreateError(error: unknown, context?: CreateErrorContext): NormalizedCreateError {
  if (error instanceof AppError) {
    return {
      message: error.message,
      status: error.status,
      kind: "app"
    };
  }

  const rawMessage = error instanceof Error ? error.message : String(error || "");
  const upstreamStatus = getErrorStatus(error);
  const message = rawMessage.replace(/\s+/g, " ").trim();
  const highResolution = isHighResolutionRequest(context);

  if (isUpstreamTimeout(upstreamStatus, message)) {
    return {
      message: highResolution
        ? "4K 生图请求在上游网关超时。请先改用 2K，或确认你的 OpenAI-compatible 网关支持 4096px 输出并提高读取超时时间。"
        : "上游生图网关超时，没有返回图片。请稍后重试，或切换更快的供应商/模型、降低复杂度。如果这是你自己的网关，请提高网关读取超时时间。",
      status: 504,
      kind: "upstream-timeout"
    };
  }

  if (upstreamStatus && upstreamStatus >= 500) {
    return {
      message: highResolution
        ? "4K 生图请求被上游网关拒绝或处理失败。请先使用 2K，或确认你的 OpenAI-compatible 网关支持 4096px 输出。"
        : "上游生图服务暂时不可用，请稍后重试或切换供应商。",
      status: 502,
      kind: "upstream"
    };
  }

  if (/<html[\s>]|openresty|nginx/i.test(message)) {
    return {
      message: highResolution
        ? "4K 生图请求没有返回有效图片。请先使用 2K，或检查第三方 Base URL、模型 ID 和 4096px 输出支持。"
        : "上游服务返回了非图片响应，生成失败。请检查第三方 Base URL、模型 ID 或稍后重试。",
      status: 502,
      kind: "upstream"
    };
  }

  return {
    message: message || "Generation failed.",
    status: upstreamStatus && upstreamStatus >= 400 ? upstreamStatus : 500,
    kind: "upstream"
  };
}

function isRetryableCreateError(normalized: NormalizedCreateError) {
  return normalized.kind === "upstream-timeout"
    || normalized.status === 408
    || normalized.status === 409
    || normalized.status === 425
    || normalized.status === 429
    || normalized.status >= 500;
}

function startHeartbeat(jobId: string, deps: ImageJobRunnerDeps) {
  const timer = setInterval(() => {
    void deps.imageJobClient.updateMany({
      where: {
        id: jobId,
        status: "running",
        lockedBy: deps.workerId
      },
      data: {
        heartbeatAt: new Date()
      }
    }).catch((error) => {
      console.warn("[images/jobs] heartbeat failed", {
        jobId,
        cause: error instanceof Error ? error.message : String(error)
      });
    });
  }, IMAGE_JOB_HEARTBEAT_INTERVAL_MS);

  unrefTimer(timer);
  return () => clearInterval(timer);
}

async function isImageJobStillOwnedByThisWorker(jobId: string, deps: ImageJobRunnerDeps) {
  const latest = await deps.imageJobClient.findUnique({ where: { id: jobId } });
  return Boolean(latest && !shouldIgnoreImageJobProviderResult(latest, deps.workerId));
}

async function releaseImageJobForRetry(job: StoredImageJob, message: string, deps: ImageJobRunnerDeps) {
  await deps.imageJobClient.updateMany({
    where: {
      id: job.id,
      status: "running",
      lockedBy: deps.workerId
    },
    data: {
      status: "pending",
      error: message,
      lockedBy: null,
      lockedAt: null,
      heartbeatAt: null,
      startedAt: null,
      finishedAt: null
    }
  });

  if (job.batchId && job.batchItemId) {
    await deps.attachJobToBatchItem(job.userId, job.batchId, job.batchItemId, job.id);
  }
}

export async function runImageJobWithDeps(
  job: StoredImageJob,
  options: RunImageJobOptions = {},
  deps: ImageJobRunnerDeps
) {
  const stopHeartbeat = startHeartbeat(job.id, deps);
  const startedAt = Date.now();
  let upstreamMs: number | undefined;
  let fileSaveMs: number | undefined;
  let logContext: {
    provider?: ProviderId;
    model?: string;
    providerConfigSource?: ProviderSource;
    baseUrlHost?: string;
    mode?: ImageMode;
    size?: string;
    aspectRatio?: string;
    resolution?: string;
    quality?: string;
    referenceImageCount?: number;
  } = {
    provider: isProviderId(job.provider) ? job.provider : undefined,
    model: job.model
  };

  try {
    const input = parseJobRequest(job.requestJson);
    await deps.markBatchItemRunning(job.userId, job.batchId, job.batchItemId);
    const resolvedProvider = await getResolvedProviderConfig(job.userId, input.provider);
    if (!resolvedProvider.apiKey) {
      throw new AppError("This provider has no API key configured.", 503);
    }

    logContext = {
      provider: input.provider,
      model: input.modelId,
      providerConfigSource: resolvedProvider.source,
      baseUrlHost: getBaseUrlHost(resolvedProvider.baseUrl),
      mode: input.mode,
      size: input.size,
      aspectRatio: input.aspectRatio,
      resolution: input.resolution,
      quality: input.quality,
      referenceImageCount: input.sourceImageIds.length + input.uploadImageIds.length
    };

    const model = resolveModelForJob(input) ?? validateModelRequest(input.provider, input.modelId, input.mode, resolvedProvider);

    if (!modelSupports(model, input.mode)) {
      throw new AppError("This model does not support that mode.");
    }

    const allowCustomSize = input.provider === "openai" && isOpenAiCompatibleGateway(resolvedProvider);
    if (input.provider === "openai" && !allowCustomSize) {
      assertOfficialOpenAiSize(input.size);
    }

    assertModelOptions(model, { ...input, allowCustomSize });

    const provider = getProvider(input.provider);
    const inputImages = await loadInputImages(job.userId, input.sourceImageIds, input.uploadImageIds);
    const upstreamStartedAt = Date.now();
    const result = await provider.createImage({
      credentials: {
        apiKey: resolvedProvider.apiKey,
        baseUrl: resolvedProvider.baseUrl
      },
      model,
      mode: input.mode,
      prompt: input.prompt,
      size: input.size,
      aspectRatio: input.aspectRatio,
      quality: input.quality,
      inputFidelity: input.inputFidelity,
      inputImages
    });
    upstreamMs = Date.now() - upstreamStartedAt;

    if (!(await isImageJobStillOwnedByThisWorker(job.id, deps))) {
      console.warn("[images/jobs] ignoring late provider result", {
        jobId: job.id,
        elapsedMs: Date.now() - startedAt
      });
      return;
    }

    const fileSaveStartedAt = Date.now();
    const generated = await saveGeneratedImage(job.userId, result.imageBuffer, result.mimeType);
    fileSaveMs = Date.now() - fileSaveStartedAt;
    const resultId = randomUUID();

    if (!(await isImageJobStillOwnedByThisWorker(job.id, deps))) {
      console.warn("[images/jobs] ignoring late provider result after file save", {
        jobId: job.id,
        elapsedMs: Date.now() - startedAt
      });
      return;
    }

    await appendHistory({
      id: resultId,
      userId: job.userId,
      provider: input.provider,
      model: model.modelId,
      mode: input.mode,
      prompt: input.prompt,
      filePath: generated.filePath,
      mimeType: generated.mimeType,
      thumbnailPath: generated.thumbnailPath,
      thumbnailMimeType: generated.thumbnailMimeType,
      size: input.size,
      aspectRatio: input.aspectRatio,
      quality: input.quality,
      inputFidelity: input.provider === "openai" ? input.inputFidelity : undefined,
      sourceImageIds: input.sourceImageIds,
      uploadImageIds: input.uploadImageIds,
      parentId: input.sourceImageIds.length === 1 ? input.sourceImageIds[0] : undefined,
      batchId: job.batchId ?? undefined,
      batchItemId: job.batchItemId ?? undefined,
      providerMeta: result.providerMeta
    });

    await deps.markBatchItemSucceeded(job.userId, job.batchId, job.batchItemId, resultId);

    const finishedAt = new Date();
    await deps.imageJobClient.updateMany({
      where: {
        id: job.id,
        status: "running",
        lockedBy: deps.workerId
      },
      data: {
        status: "succeeded",
        resultId,
        error: null,
        lockedBy: null,
        lockedAt: null,
        heartbeatAt: null,
        finishedAt,
        executionMs: finishedAt.getTime() - startedAt,
        upstreamMs,
        fileSaveMs
      }
    });
  } catch (error) {
    const normalized = normalizeCreateError(error, {
      size: logContext.size,
      resolution: logContext.resolution
    });
    const failure = classifyImageJobFailure(normalized.message, {
      status: normalized.status,
      kind: normalized.kind,
      cause: error
    });
    const finishedAt = new Date();
    const logPayload = {
      jobId: job.id,
      status: normalized.status,
      elapsedMs: finishedAt.getTime() - startedAt,
      upstreamMs,
      fileSaveMs,
      ...logContext,
      message: normalized.message,
      cause: error instanceof Error ? error.message : String(error),
      upstreamError: getUpstreamErrorDetails(error)
    };

    if (normalized.kind === "upstream-timeout") {
      console.warn("[images/jobs] upstream timeout", logPayload);
    } else {
      console.error("[images/jobs] generation failed", logPayload);
    }

    if (options.retryable && isRetryableCreateError(normalized)) {
      await releaseImageJobForRetry(job, normalized.message, deps);
      throw new RetryableImageJobError(normalized.message);
    }

    const failed = await deps.imageJobClient.updateMany({
      where: {
        id: job.id,
        status: "running",
        lockedBy: deps.workerId
      },
      data: {
        status: "failed",
        error: normalized.message,
        failureCode: failure.code,
        failureCategory: failure.category,
        lockedBy: null,
        lockedAt: null,
        heartbeatAt: null,
        finishedAt,
        executionMs: finishedAt.getTime() - startedAt,
        upstreamMs,
        fileSaveMs
      }
    });

    if (failed.count > 0) {
      await deps.markBatchItemFailed(job.userId, job.batchId, job.batchItemId, normalized.message);
      await deps.refundJobPlatformQuota(job);
    }
  } finally {
    stopHeartbeat();
  }
}
