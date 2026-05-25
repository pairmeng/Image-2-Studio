import type { ImageMode, ProviderId } from "./models";

export type ImageRecordProvider = ProviderId | (string & {});

export type PublicUser = {
  id: string;
  email: string;
  role: "ADMIN" | "USER";
  disabled: boolean;
  jobMonitorClearedAt: string | null;
  jobMonitorFinishedClearedAt: string | null;
};

export type ImageRecord = {
  id: string;
  createdAt: string;
  provider: ImageRecordProvider;
  model: string;
  mode: ImageMode;
  prompt: string;
  imageUrl: string;
  thumbnailUrl?: string;
  imagePath: string;
  size?: string;
  aspectRatio?: string;
  quality?: string;
  inputFidelity?: string;
  sourceImageIds: string[];
  uploadUrls: string[];
  parentId?: string;
  batchId?: string;
  batchItemId?: string;
  projectId?: string;
  tags: string[];
  providerMeta?: Record<string, unknown>;
};

export type HistoryResponse = {
  records: ImageRecord[];
  nextCursor?: string;
};

export type CatalogResponse = {
  providers: Array<{
    provider: ProviderId;
    label: string;
    configured: boolean;
    supportsCustomSize?: boolean;
    baseUrlConfigured?: boolean;
  }>;
  models: Array<{
    provider: ProviderId;
    modelId: string;
    label: string;
    description: string;
    capabilities: string[];
    defaultSize?: string;
    supportedSizes?: string[];
    defaultAspectRatio?: string;
    supportedAspectRatios?: string[];
    defaultQuality?: string;
    qualityOptions?: string[];
    inputFidelityOptions?: string[];
    supportsCustomSize?: boolean;
  }>;
};

export type ImageJobStatus = "pending" | "paused" | "running" | "succeeded" | "failed";

export type CreateImageJobResponse = {
  jobId: string;
  status: ImageJobStatus;
};

export type ImageJobResponse = {
  id: string;
  status: ImageJobStatus;
  provider: ProviderId;
  model: string;
  mode: ImageMode;
  prompt?: string;
  batchId?: string;
  batchItemId?: string;
  resultId?: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  error?: string;
  queueWaitMs?: number;
  executionMs?: number;
  upstreamMs?: number;
  fileSaveMs?: number;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
};

export type ImageJobsResponse = {
  jobs: ImageJobResponse[];
};

export type ImageBatchStatus = "queued" | "paused" | "running" | "succeeded" | "failed" | "partial";

export type ImageBatchItemStatus = "queued" | "creating" | "pending" | "paused" | "running" | "succeeded" | "failed";

export type ImageBatchItemResponse = {
  id: string;
  batchId: string;
  index: number;
  provider: ProviderId;
  model: string;
  mode: ImageMode;
  prompt: string;
  status: ImageBatchItemStatus;
  jobId?: string;
  resultId?: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  error?: string;
  retryCount: number;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
};

export type ImageBatchResponse = {
  id: string;
  name: string;
  provider: ProviderId;
  model: string;
  mode: ImageMode;
  status: ImageBatchStatus;
  totalCount: number;
  successCount: number;
  failedCount: number;
  promptFormat: string;
  createdAt: string;
  updatedAt: string;
  finishedAt?: string;
};

export type ImageBatchDetailResponse = ImageBatchResponse & {
  items: ImageBatchItemResponse[];
};

export type ImageProjectResponse = {
  id: string;
  name: string;
  color?: string;
  imageCount: number;
  createdAt: string;
  updatedAt: string;
};

export type PromptTemplateResponse = {
  id: string;
  title: string;
  category: string;
  mode: "text-to-image" | "image-to-image" | "universal";
  content: string;
  createdAt: string;
  updatedAt: string;
};
