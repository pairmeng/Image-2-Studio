import type {
  CreateImageJobResponse,
  ImageBatchDetailResponse,
  ImageJobResponse
} from "@/lib/types";
import type { ImageMode, ProviderId } from "@/lib/models";
import { fetchJson } from "./api-client";

export type ImageJobFormInput = {
  provider: ProviderId;
  model: string;
  mode: ImageMode;
  prompt: string;
  size: string;
  aspectRatio: string;
  resolution: string;
  quality: string;
  inputFidelity: string;
  sourceImageIds: string[];
  files: File[];
};

type BatchJobMeta = {
  batchId: string;
  itemId: string;
};

export function buildImageJobFormData(input: ImageJobFormInput, batchMeta?: BatchJobMeta) {
  const formData = new FormData();
  formData.set("provider", input.provider);
  formData.set("model", input.model);
  formData.set("mode", input.mode);
  formData.set("prompt", input.prompt);
  formData.set("size", input.size);
  formData.set("aspectRatio", input.aspectRatio);
  formData.set("resolution", input.resolution);
  formData.set("quality", input.quality);
  formData.set("inputFidelity", input.inputFidelity);

  if (batchMeta) {
    formData.set("batchId", batchMeta.batchId);
    formData.set("batchItemId", batchMeta.itemId);
  }

  input.sourceImageIds.forEach((id) => formData.append("sourceImageIds", id));
  input.files.forEach((file) => formData.append("files", file));

  return formData;
}

export function buildBatchStartFormData(input: ImageJobFormInput, prompts: string[], promptFormat: string) {
  const formData = buildImageJobFormData({
    ...input,
    prompt: prompts[0] ?? ""
  });
  formData.delete("prompt");
  formData.set("prompts", JSON.stringify(prompts));
  formData.set("promptFormat", promptFormat);

  return formData;
}

export async function requestCreateImageJob(formData: FormData, fallbackMessage: string) {
  const body = await fetchJson<Partial<CreateImageJobResponse>>("/api/images/create", {
    method: "POST",
    body: formData,
    fallbackMessage
  });

  if (!body.jobId) {
    throw new Error(fallbackMessage);
  }

  return {
    jobId: body.jobId,
    status: body.status ?? "pending"
  };
}

export async function requestStartImageBatch(formData: FormData, fallbackMessage: string) {
  const body = await fetchJson<Partial<ImageBatchDetailResponse>>("/api/images/batches/start", {
    method: "POST",
    body: formData,
    fallbackMessage
  });

  return assertBatchDetail(body, fallbackMessage);
}

export async function requestImageJob(jobId: string, fallbackMessage: string) {
  const body = await fetchJson<Partial<ImageJobResponse>>(`/api/images/jobs/${jobId}`, {
    cache: "no-store",
    fallbackMessage
  });

  return body.id && body.status ? body as ImageJobResponse : null;
}

export async function requestImageBatch(batchId: string, fallbackMessage: string) {
  const body = await fetchJson<Partial<ImageBatchDetailResponse>>(`/api/images/batches/${batchId}`, {
    cache: "no-store",
    fallbackMessage
  });

  return assertBatchDetail(body, fallbackMessage);
}

export async function requestRetryImageBatchItems(batchId: string, itemIds: string[], fallbackMessage: string) {
  const body = await fetchJson<Partial<ImageBatchDetailResponse>>(`/api/images/batches/${batchId}/retry`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ itemIds }),
    fallbackMessage
  });

  return assertBatchDetail(body, fallbackMessage);
}

export async function requestPauseImageBatch(batchId: string, fallbackMessage: string) {
  const body = await fetchJson<Partial<ImageBatchDetailResponse>>(`/api/images/batches/${batchId}/pause`, {
    method: "POST",
    fallbackMessage
  });

  return assertBatchDetail(body, fallbackMessage);
}

export async function requestResumeImageBatch(batchId: string, fallbackMessage: string) {
  const body = await fetchJson<Partial<ImageBatchDetailResponse>>(`/api/images/batches/${batchId}/resume`, {
    method: "POST",
    fallbackMessage
  });

  return assertBatchDetail(body, fallbackMessage);
}

export async function requestRetryImageJob(jobId: string, fallbackMessage: string) {
  const body = await fetchJson<Partial<CreateImageJobResponse>>(`/api/images/jobs/${jobId}/retry`, {
    method: "POST",
    fallbackMessage
  });

  if (!body.jobId) {
    throw new Error(fallbackMessage);
  }

  return {
    jobId: body.jobId,
    status: body.status ?? "pending"
  };
}

function assertBatchDetail(body: Partial<ImageBatchDetailResponse>, fallbackMessage: string) {
  if (!body.id || !Array.isArray(body.items)) {
    throw new Error(fallbackMessage);
  }

  return body as ImageBatchDetailResponse;
}
