import {
  createOpenAICompatibleModel,
  createGenericProviderModel,
  getModel,
  isImageMode,
  isProviderId,
  modelSupports,
  OPENAI_PROVIDER_ID,
  type ImageMode,
  type ModelDefinition,
  type ProviderId
} from "../models";
import { BATCH_START_MAX_PROMPT_LENGTH, BATCH_START_MAX_PROMPTS, type BatchStartPromptParseError } from "../batch-start";
import { AppError } from "./errors";
import { assertAllowedImageFile, readStoredImageForUser } from "./files";
import { findRecordsByIds } from "./history";
import { getModelsForResolvedProvider, getResolvedProviderConfig, type ResolvedProviderConfig } from "./provider-config";
import type { InputImage } from "./provider-types";

const MAX_PROMPT_LENGTH = 2000;
const MAX_REFERENCE_IMAGES = 4;
const OPENAI_OFFICIAL_IMAGE_SIZES = new Set(["1024x1024", "1536x1024", "1024x1536", "auto"]);

export type ImageJobRequest = {
  provider: ProviderId;
  modelId: string;
  mode: ImageMode;
  prompt: string;
  size?: string;
  aspectRatio?: string;
  resolution?: string;
  quality?: string;
  inputFidelity?: string;
  sourceImageIds: string[];
  uploadImageIds: string[];
  customModel: boolean;
  platformQuotaDate?: string;
};

export type ResolvedImageJobFormInput = {
  provider: ProviderId;
  model: ModelDefinition;
  mode: ImageMode;
  prompt: string;
  size?: string;
  aspectRatio?: string;
  resolution?: string;
  quality?: string;
  inputFidelity?: string;
  sourceImageIds: string[];
  files: File[];
  resolvedProvider: ResolvedProviderConfig;
};

export function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export function getOptionalString(formData: FormData, key: string) {
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

function mapAspectRatioToOfficialOpenAiSize(aspectRatio: string | undefined) {
  if (!aspectRatio || aspectRatio === "auto" || aspectRatio === "1:1") return "1024x1024";

  const [rawWidth, rawHeight] = aspectRatio.split(":").map(Number);
  if (!rawWidth || !rawHeight) return "1024x1024";

  if (rawWidth > rawHeight) return "1536x1024";
  if (rawHeight > rawWidth) return "1024x1536";
  return "1024x1024";
}

function mapAspectRatioToResolutionSize(aspectRatio: string | undefined, resolution: string | undefined) {
  const longEdge = Number.parseInt(resolution ?? "", 10);
  const safeLongEdge = Number.isFinite(longEdge) && longEdge > 0 ? longEdge : 1024;

  if (!aspectRatio || aspectRatio === "auto" || aspectRatio === "1:1") return `${safeLongEdge}x${safeLongEdge}`;

  const [rawWidth, rawHeight] = aspectRatio.split(":").map(Number);
  if (!rawWidth || !rawHeight) return `${safeLongEdge}x${safeLongEdge}`;

  if (rawWidth >= rawHeight) {
    return `${safeLongEdge}x${Math.round((safeLongEdge * rawHeight) / rawWidth)}`;
  }

  return `${Math.round((safeLongEdge * rawWidth) / rawHeight)}x${safeLongEdge}`;
}

function resolveImageRequestSize(
  provider: ProviderId,
  resolvedProvider: ResolvedProviderConfig,
  aspectRatio: string | undefined,
  resolution: string | undefined,
  requestedSize: string | undefined
) {
  if (provider !== OPENAI_PROVIDER_ID) return requestedSize;

  if (resolvedProvider.adapterId !== "openai" || isOpenAiCompatibleGateway(resolvedProvider)) {
    return resolution ? mapAspectRatioToResolutionSize(aspectRatio, resolution) : requestedSize;
  }

  if (!resolution || resolution === "1024") return mapAspectRatioToOfficialOpenAiSize(aspectRatio);

  return mapAspectRatioToResolutionSize(aspectRatio, resolution);
}

export function isOpenAiCompatibleGateway(resolvedProvider: ResolvedProviderConfig) {
  return Boolean(resolvedProvider.baseUrl);
}

export function assertOfficialOpenAiSize(size: string | undefined) {
  if (!size || OPENAI_OFFICIAL_IMAGE_SIZES.has(size)) return;

  throw new AppError("Official OpenAI image generation does not support this resolution. Configure an OpenAI-compatible Base URL for 2K/4K output, or choose 1K.", 400);
}

export function assertModelOptions(model: ModelDefinition, input: {
  size?: string;
  aspectRatio?: string;
  quality?: string;
  inputFidelity?: string;
  allowCustomSize?: boolean;
}) {
  if (!input.allowCustomSize && !isAllowedOption(input.size, model.supportedSizes)) {
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

export function validateModelRequest(provider: ProviderId, modelId: string, mode: ImageMode, resolvedProvider: ResolvedProviderConfig) {
  const model = getModelsForResolvedProvider(resolvedProvider).find((item) => item.provider === provider && item.modelId === modelId)
    ?? getModel(provider, modelId)
    ?? (resolvedProvider.model && resolvedProvider.model === modelId
      ? createGenericProviderModel({
        provider,
        adapterId: resolvedProvider.adapterId,
        modelId: resolvedProvider.model,
        supportsCustomSize: resolvedProvider.adapterId !== "openai" || Boolean(resolvedProvider.baseUrl)
      })
      : undefined);

  if (!model) {
    throw new AppError("Unknown provider or model.");
  }

  if (!modelSupports(model, mode)) {
    throw new AppError("This model does not support that mode.");
  }

  return model;
}

export function parseJobRequest(requestJson: string): ImageJobRequest {
  let parsed: unknown;

  try {
    parsed = JSON.parse(requestJson);
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
    resolution: typeof input.resolution === "string" ? input.resolution : undefined,
    quality: typeof input.quality === "string" ? input.quality : undefined,
    inputFidelity: typeof input.inputFidelity === "string" ? input.inputFidelity : undefined,
    sourceImageIds: Array.isArray(input.sourceImageIds) ? input.sourceImageIds.filter((item) => typeof item === "string") : [],
    uploadImageIds: Array.isArray(input.uploadImageIds) ? input.uploadImageIds.filter((item) => typeof item === "string") : [],
    customModel: Boolean(input.customModel),
    platformQuotaDate: typeof input.platformQuotaDate === "string" ? input.platformQuotaDate : undefined
  };
}

export function resolveModelForJob(input: ImageJobRequest, resolvedProvider?: ResolvedProviderConfig) {
  const resolvedModel = resolvedProvider
    ? getModelsForResolvedProvider(resolvedProvider).find((model) => model.provider === input.provider && model.modelId === input.modelId)
    : undefined;
  if (resolvedModel) return resolvedModel;

  const catalogModel = getModel(input.provider, input.modelId);
  if (catalogModel) return catalogModel;

  if (input.customModel) {
    return resolvedProvider?.adapterId === "openai-compatible" || input.provider === OPENAI_PROVIDER_ID
      ? createOpenAICompatibleModel(input.modelId, input.provider)
      : createGenericProviderModel({
        provider: input.provider,
        adapterId: resolvedProvider?.adapterId ?? "mock",
        modelId: input.modelId,
        supportsCustomSize: resolvedProvider?.adapterId !== "openai" || Boolean(resolvedProvider?.baseUrl)
      });
  }

  return undefined;
}

export async function loadInputImages(userId: string, sourceImageIds: string[], uploadImageIds: string[]): Promise<InputImage[]> {
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

export function getBatchStartPromptErrorMessage(error: BatchStartPromptParseError | undefined) {
  if (error === "too-many") return `Use ${BATCH_START_MAX_PROMPTS} prompts or fewer.`;
  if (error === "too-long") return `Each prompt must be ${BATCH_START_MAX_PROMPT_LENGTH} characters or fewer.`;
  return "Enter at least one prompt.";
}

export async function resolveImageJobFormInput(userId: string, formData: FormData, prompt: string): Promise<ResolvedImageJobFormInput> {
  const providerValue = getString(formData, "provider");
  const modelId = getString(formData, "model");
  const modeValue = getString(formData, "mode");

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

  const resolvedProvider = await getResolvedProviderConfig(userId, providerValue);
  if (!resolvedProvider.enabled) {
    throw new AppError("This provider is disabled.", 503);
  }

  if (!resolvedProvider.apiKey) {
    throw new AppError("This provider has no API key configured.", 503);
  }

  const model = validateModelRequest(providerValue, modelId, modeValue, resolvedProvider);
  const aspectRatio = getOptionalString(formData, "aspectRatio") ?? model.defaultAspectRatio;
  const resolution = getOptionalString(formData, "resolution");
  const requestedSize = getOptionalString(formData, "size")
    ?? mapAspectRatioToResolutionSize(aspectRatio, resolution)
    ?? model.defaultSize;
  const size = resolveImageRequestSize(providerValue, resolvedProvider, aspectRatio, resolution, requestedSize);
  const quality = getOptionalString(formData, "quality") ?? model.defaultQuality;
  const inputFidelity = getOptionalString(formData, "inputFidelity") ?? model.inputFidelityOptions?.[0];
  const allowCustomSize = resolvedProvider.adapterId !== "openai" || isOpenAiCompatibleGateway(resolvedProvider) || Boolean(model.supportsCustomSize);

  if (providerValue === OPENAI_PROVIDER_ID && resolvedProvider.adapterId === "openai" && !allowCustomSize) {
    assertOfficialOpenAiSize(size);
  }

  assertModelOptions(model, { size, aspectRatio, quality, inputFidelity, allowCustomSize });

  const files = getFiles(formData);
  const sourceImageIds = getStringList(formData, "sourceImageIds");

  for (const file of files) {
    assertAllowedImageFile(file);
  }

  const maxReferenceImages = model.maxReferenceImages ?? MAX_REFERENCE_IMAGES;
  if (files.length + sourceImageIds.length > maxReferenceImages) {
    throw new AppError(`Use at most ${maxReferenceImages} reference images.`);
  }

  if (modeValue === "image-to-image" && files.length + sourceImageIds.length === 0) {
    throw new AppError("Image-to-image needs an upload or a history image.");
  }

  await assertSourceImagesExist(userId, sourceImageIds);

  return {
    provider: providerValue,
    model,
    mode: modeValue,
    prompt,
    size,
    aspectRatio,
    resolution,
    quality,
    inputFidelity,
    sourceImageIds,
    files,
    resolvedProvider
  };
}

export function buildImageJobRequest(
  input: ResolvedImageJobFormInput,
  prompt: string,
  uploadImageIds: string[],
  platformQuotaDate?: string
): ImageJobRequest {
  return {
    provider: input.provider,
    modelId: input.model.modelId,
    mode: input.mode,
    prompt,
    size: input.size,
    aspectRatio: input.aspectRatio,
    resolution: input.resolution,
    quality: input.quality,
    inputFidelity: input.inputFidelity,
    sourceImageIds: input.sourceImageIds,
    uploadImageIds,
    customModel: !getModel(input.provider, input.model.modelId),
    platformQuotaDate
  };
}
