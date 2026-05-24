import { randomUUID } from "node:crypto";
import {
  createFalTextModel,
  createOpenAICompatibleModel,
  getModel,
  isImageMode,
  isProviderId,
  modelSupports,
  type ImageMode,
  type ModelDefinition,
  type ProviderId
} from "../models";
import type { CreateImageJobResponse, ImageJobResponse, ImageJobStatus } from "../types";
import { AppError } from "./errors";
import { readStoredImageForUser, saveGeneratedImage, saveUploadedFile } from "./files";
import { appendHistory, findRecordsByIds } from "./history";
import { prisma } from "./db";
import { getProvider, isProviderConfigured } from "./providers";
import { getProviderModel, getResolvedProviderConfig } from "./provider-config";
import type { InputImage } from "./provider-types";
import { assertAndConsumePlatformQuota } from "./usage";

const MAX_PROMPT_LENGTH = 2000;
const MAX_REFERENCE_IMAGES = 4;

type ProviderSource = "user" | "platform" | "env" | "none";

type ImageJobRequest = {
  provider: ProviderId;
  modelId: string;
  mode: ImageMode;
  prompt: string;
  size?: string;
  aspectRatio?: string;
  quality?: string;
  inputFidelity?: string;
  sourceImageIds: string[];
  uploadImageIds: string[];
  customModel: boolean;
};

type StoredImageJob = {
  id: string;
  userId: string;
  status: string;
  provider: string;
  model: string;
  mode: string;
  prompt: string;
  requestJson: string;
  resultId: string | null;
  error: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type ImageJobClient = {
  create(input: { data: Record<string, unknown> }): Promise<StoredImageJob>;
  findFirst(input: { where: Record<string, unknown> }): Promise<StoredImageJob | null>;
  findUnique(input: { where: { id: string } }): Promise<StoredImageJob | null>;
  update(input: { where: { id: string }; data: Record<string, unknown> }): Promise<StoredImageJob>;
  updateMany(input: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
};

type NormalizedCreateError = {
  message: string;
  status: number;
  kind: "app" | "upstream" | "upstream-timeout";
};

const runningJobs = new Set<string>();

function imageJobClient() {
  const client = (prisma as unknown as { imageJob?: ImageJobClient }).imageJob;
  if (!client) {
    throw new AppError("Image job database client is not ready. Please rebuild the image so Prisma Client is regenerated.", 503);
  }

  return client;
}

function getErrorStatus(error: unknown) {
  if (!error || typeof error !== "object") return undefined;

  const status = (error as { status?: unknown }).status;
  if (typeof status === "number") return status;

  const code = (error as { code?: unknown }).code;
  if (typeof code === "number") return code;

  return undefined;
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

function normalizeCreateError(error: unknown): NormalizedCreateError {
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

  if (isUpstreamTimeout(upstreamStatus, message)) {
    return {
      message: "上游生图网关超时，没有返回图片。请稍后重试，或切换更快的供应商/模型、降低复杂度。如果这是你自己的网关，请提高网关读取超时时间。",
      status: 504,
      kind: "upstream-timeout"
    };
  }

  if (upstreamStatus && upstreamStatus >= 500) {
    return {
      message: "上游生图服务暂时不可用，请稍后重试或切换供应商。",
      status: 502,
      kind: "upstream"
    };
  }

  if (/<html[\s>]|openresty|nginx/i.test(message)) {
    return {
      message: "上游服务返回了非图片响应，生成失败。请检查第三方 Base URL、模型 ID 或稍后重试。",
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

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getOptionalString(formData: FormData, key: string) {
  const value = getString(formData, key);
  return value || undefined;
}

function getStringList(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .flatMap((value) => {
      if (typeof value !== "string") return [];
      const trimmed = value.trim();
      if (!trimmed) return [];

      if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
        try {
          const parsed = JSON.parse(trimmed);
          return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
        } catch {
          return [];
        }
      }

      return trimmed.split(",").map((item) => item.trim()).filter(Boolean);
    });
}

function getFiles(formData: FormData) {
  return formData
    .getAll("files")
    .filter((value): value is File => value instanceof File && value.size > 0);
}

function isAllowedOption(value: string | undefined, allowed: string[] | undefined) {
  return !value || !allowed || allowed.includes(value);
}

function mapAspectRatioToOpenAiSize(aspectRatio: string | undefined) {
  if (!aspectRatio || aspectRatio === "auto" || aspectRatio === "1:1") return "1024x1024";

  const [rawWidth, rawHeight] = aspectRatio.split(":").map(Number);
  if (!rawWidth || !rawHeight) return "1024x1024";

  if (rawWidth > rawHeight) return "1536x1024";
  if (rawHeight > rawWidth) return "1024x1536";
  return "1024x1024";
}

function assertModelOptions(model: ModelDefinition, input: {
  size?: string;
  aspectRatio?: string;
  quality?: string;
  inputFidelity?: string;
}) {
  if (!isAllowedOption(input.size, model.supportedSizes)) {
    throw new AppError("This model does not support that size.");
  }

  if (!isAllowedOption(input.aspectRatio, model.supportedAspectRatios)) {
    throw new AppError("This model does not support that aspect ratio.");
  }

  if (!isAllowedOption(input.quality, model.qualityOptions)) {
    throw new AppError("This model does not support that quality setting.");
  }

  if (!isAllowedOption(input.inputFidelity, model.inputFidelityOptions)) {
    throw new AppError("This model does not support that input fidelity.");
  }
}

async function validateModelRequest(userId: string, provider: ProviderId, modelId: string, mode: ImageMode) {
  const configuredModel = await getProviderModel(userId, provider);
  const model = getModel(provider, modelId)
    ?? (provider === "openai" && configuredModel && configuredModel === modelId
      ? createOpenAICompatibleModel(configuredModel)
      : provider === "fal" && configuredModel && configuredModel === modelId
        ? createFalTextModel(configuredModel)
        : undefined);

  if (!model) {
    throw new AppError("Unknown provider or model.");
  }

  if (!modelSupports(model, mode)) {
    throw new AppError("This model does not support that mode.");
  }

  return model;
}

function resolveStoredJobStatus(status: string): ImageJobStatus {
  if (status === "running" || status === "succeeded" || status === "failed") return status;
  return "pending";
}

function toJobResponse(job: StoredImageJob): ImageJobResponse {
  const status = resolveStoredJobStatus(job.status);
  return {
    id: job.id,
    status,
    provider: job.provider as ProviderId,
    model: job.model,
    mode: job.mode as ImageMode,
    resultId: job.resultId ?? undefined,
    imageUrl: status === "succeeded" && job.resultId ? `/api/images/file/${job.resultId}` : undefined,
    error: job.error ?? undefined,
    createdAt: job.createdAt.toISOString(),
    startedAt: job.startedAt?.toISOString(),
    finishedAt: job.finishedAt?.toISOString()
  };
}

function parseJobRequest(job: StoredImageJob): ImageJobRequest {
  let parsed: unknown;

  try {
    parsed = JSON.parse(job.requestJson);
  } catch {
    throw new AppError("Image job payload is invalid.", 500);
  }

  if (!parsed || typeof parsed !== "object") {
    throw new AppError("Image job payload is invalid.", 500);
  }

  const input = parsed as Partial<ImageJobRequest>;
  const provider = typeof input.provider === "string" ? input.provider : null;
  const mode = typeof input.mode === "string" ? input.mode : null;

  if (!isProviderId(provider) || !isImageMode(mode) || typeof input.modelId !== "string") {
    throw new AppError("Image job payload is invalid.", 500);
  }

  return {
    provider,
    modelId: input.modelId,
    mode,
    prompt: typeof input.prompt === "string" ? input.prompt : "",
    size: typeof input.size === "string" ? input.size : undefined,
    aspectRatio: typeof input.aspectRatio === "string" ? input.aspectRatio : undefined,
    quality: typeof input.quality === "string" ? input.quality : undefined,
    inputFidelity: typeof input.inputFidelity === "string" ? input.inputFidelity : undefined,
    sourceImageIds: Array.isArray(input.sourceImageIds) ? input.sourceImageIds.filter((item) => typeof item === "string") : [],
    uploadImageIds: Array.isArray(input.uploadImageIds) ? input.uploadImageIds.filter((item) => typeof item === "string") : [],
    customModel: Boolean(input.customModel)
  };
}

function resolveModelForJob(input: ImageJobRequest) {
  const catalogModel = getModel(input.provider, input.modelId);
  if (catalogModel) return catalogModel;

  if (input.customModel && input.provider === "openai") {
    return createOpenAICompatibleModel(input.modelId);
  }

  if (input.customModel && input.provider === "fal") {
    return createFalTextModel(input.modelId);
  }

  return undefined;
}

async function loadInputImages(userId: string, sourceImageIds: string[], uploadImageIds: string[]): Promise<InputImage[]> {
  const sourceInputs = await Promise.all(sourceImageIds.map((id) => readStoredImageForUser(userId, id)));
  const uploadedInputs = await Promise.all(uploadImageIds.map((id) => readStoredImageForUser(userId, id)));

  return [...sourceInputs, ...uploadedInputs].map((file) => ({
    filename: file.filename,
    mimeType: file.mimeType,
    buffer: file.buffer,
    publicUrl: file.imageUrl
  }));
}

async function assertSourceImagesExist(userId: string, sourceImageIds: string[]) {
  if (sourceImageIds.length === 0) return;

  const records = await findRecordsByIds(userId, sourceImageIds);
  const foundIds = new Set(records.map((record: { id: string }) => record.id));
  const missing = sourceImageIds.filter((id) => !foundIds.has(id));

  if (missing.length > 0) {
    throw new AppError("Could not find the selected source image.");
  }
}

export async function createImageJobFromFormData(userId: string, formData: FormData): Promise<CreateImageJobResponse> {
  const providerValue = getString(formData, "provider");
  const modelId = getString(formData, "model");
  const modeValue = getString(formData, "mode");
  const prompt = getString(formData, "prompt");

  if (!isProviderId(providerValue)) {
    throw new AppError("Choose a valid provider.");
  }

  if (!isImageMode(modeValue)) {
    throw new AppError("Choose a valid generation mode.");
  }

  if (!prompt) {
    throw new AppError("Enter a prompt.");
  }

  if (prompt.length > MAX_PROMPT_LENGTH) {
    throw new AppError(`Prompt must be ${MAX_PROMPT_LENGTH} characters or fewer.`);
  }

  if (!(await isProviderConfigured(userId, providerValue))) {
    throw new AppError("This provider has no API key configured.", 503);
  }

  const resolvedProvider = await getResolvedProviderConfig(userId, providerValue);
  if (!resolvedProvider.apiKey) {
    throw new AppError("This provider has no API key configured.", 503);
  }

  const jobs = imageJobClient();

  if (resolvedProvider.source !== "user") {
    await assertAndConsumePlatformQuota(userId);
  }

  const model = await validateModelRequest(userId, providerValue, modelId, modeValue);
  const requestedSize = getOptionalString(formData, "size") ?? model.defaultSize;
  const aspectRatio = getOptionalString(formData, "aspectRatio") ?? model.defaultAspectRatio;
  const size = providerValue === "openai" && model.supportedSizes
    ? mapAspectRatioToOpenAiSize(aspectRatio)
    : requestedSize;
  const quality = getOptionalString(formData, "quality") ?? model.defaultQuality;
  const inputFidelity = getOptionalString(formData, "inputFidelity") ?? model.inputFidelityOptions?.[0];

  assertModelOptions(model, { size, aspectRatio, quality, inputFidelity });

  const files = getFiles(formData);
  const sourceImageIds = getStringList(formData, "sourceImageIds");

  if (files.length + sourceImageIds.length > MAX_REFERENCE_IMAGES) {
    throw new AppError(`Use at most ${MAX_REFERENCE_IMAGES} reference images.`);
  }

  if (modeValue === "image-to-image" && files.length + sourceImageIds.length === 0) {
    throw new AppError("Image-to-image needs an upload or a history image.");
  }

  await assertSourceImagesExist(userId, sourceImageIds);
  const uploadedFiles = await Promise.all(files.map((file) => saveUploadedFile(userId, file)));

  try {
    const jobRequest: ImageJobRequest = {
      provider: providerValue,
      modelId: model.modelId,
      mode: modeValue,
      prompt,
      size,
      aspectRatio,
      quality,
      inputFidelity,
      sourceImageIds,
      uploadImageIds: uploadedFiles.map((file) => file.id),
      customModel: !getModel(providerValue, model.modelId)
    };

    const job = await jobs.create({
      data: {
        userId,
        status: "pending",
        provider: providerValue,
        model: model.modelId,
        mode: modeValue,
        prompt,
        requestJson: JSON.stringify(jobRequest)
      }
    });

    return {
      jobId: job.id,
      status: "pending"
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/imageJob/i.test(message) || /no such table.*ImageJob/i.test(message) || /relation .*ImageJob.* does not exist/i.test(message)) {
      throw new AppError("Image job table is not ready. Please run database migrations before generating images.", 503);
    }

    throw error;
  }
}

export function startImageJob(jobId: string) {
  if (runningJobs.has(jobId)) return;

  runningJobs.add(jobId);
  void runImageJob(jobId)
    .catch((error) => {
      console.error("[images/jobs] runner crashed", {
        jobId,
        cause: error instanceof Error ? error.message : String(error)
      });
    })
    .finally(() => {
      runningJobs.delete(jobId);
    });
}

export async function getImageJobForUser(userId: string, jobId: string): Promise<ImageJobResponse> {
  let job: StoredImageJob | null;

  try {
    job = await imageJobClient().findFirst({
      where: {
        id: jobId,
        userId
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/imageJob/i.test(message) || /no such table.*ImageJob/i.test(message) || /relation .*ImageJob.* does not exist/i.test(message)) {
      throw new AppError("Image job table is not ready. Please run database migrations before checking image jobs.", 503);
    }

    throw error;
  }

  if (!job) {
    throw new AppError("Image job not found.", 404);
  }

  if (job.status === "pending") {
    startImageJob(job.id);
  }

  return toJobResponse(job);
}

async function runImageJob(jobId: string) {
  const claimed = await imageJobClient().updateMany({
    where: {
      id: jobId,
      status: "pending"
    },
    data: {
      status: "running",
      error: null,
      startedAt: new Date()
    }
  });

  if (claimed.count === 0) {
    return;
  }

  const job = await imageJobClient().findUnique({ where: { id: jobId } });
  if (!job) return;

  const startedAt = Date.now();
  let logContext: {
    provider?: ProviderId;
    model?: string;
    providerConfigSource?: ProviderSource;
    baseUrlHost?: string;
  } = {
    provider: isProviderId(job.provider) ? job.provider : undefined,
    model: job.model
  };

  try {
    const input = parseJobRequest(job);
    const resolvedProvider = await getResolvedProviderConfig(job.userId, input.provider);
    if (!resolvedProvider.apiKey) {
      throw new AppError("This provider has no API key configured.", 503);
    }

    logContext = {
      provider: input.provider,
      model: input.modelId,
      providerConfigSource: resolvedProvider.source,
      baseUrlHost: getBaseUrlHost(resolvedProvider.baseUrl)
    };

    const model = resolveModelForJob(input) ?? await validateModelRequest(job.userId, input.provider, input.modelId, input.mode);

    if (!modelSupports(model, input.mode)) {
      throw new AppError("This model does not support that mode.");
    }

    assertModelOptions(model, input);

    const provider = getProvider(input.provider);
    const inputImages = await loadInputImages(job.userId, input.sourceImageIds, input.uploadImageIds);
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
    const generated = await saveGeneratedImage(job.userId, result.imageBuffer, result.mimeType);
    const resultId = randomUUID();

    await appendHistory({
      id: resultId,
      userId: job.userId,
      provider: input.provider,
      model: model.modelId,
      mode: input.mode,
      prompt: input.prompt,
      filePath: generated.filePath,
      mimeType: generated.mimeType,
      size: input.size,
      aspectRatio: input.aspectRatio,
      quality: input.quality,
      inputFidelity: input.provider === "openai" ? input.inputFidelity : undefined,
      sourceImageIds: input.sourceImageIds,
      uploadImageIds: input.uploadImageIds,
      parentId: input.sourceImageIds.length === 1 ? input.sourceImageIds[0] : undefined,
      providerMeta: result.providerMeta
    });

    await imageJobClient().update({
      where: { id: job.id },
      data: {
        status: "succeeded",
        resultId,
        error: null,
        finishedAt: new Date()
      }
    });
  } catch (error) {
    const normalized = normalizeCreateError(error);
    const logPayload = {
      jobId,
      status: normalized.status,
      elapsedMs: Date.now() - startedAt,
      ...logContext,
      message: normalized.message,
      cause: error instanceof Error ? error.message : String(error)
    };

    if (normalized.kind === "upstream-timeout") {
      console.warn("[images/jobs] upstream timeout", logPayload);
    } else {
      console.error("[images/jobs] generation failed", logPayload);
    }

    await imageJobClient().update({
      where: { id: job.id },
      data: {
        status: "failed",
        error: normalized.message,
        finishedAt: new Date()
      }
    });
  }
}
