import type { ImageMode, ProviderId } from "./models";

export type ImageRecord = {
  id: string;
  createdAt: string;
  provider: ProviderId;
  model: string;
  mode: ImageMode;
  prompt: string;
  imageUrl: string;
  imagePath: string;
  size?: string;
  aspectRatio?: string;
  quality?: string;
  inputFidelity?: string;
  sourceImageIds: string[];
  uploadUrls: string[];
  parentId?: string;
  providerMeta?: Record<string, unknown>;
};

export type CatalogResponse = {
  providers: Array<{
    provider: ProviderId;
    label: string;
    configured: boolean;
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
  }>;
};

export type ImageJobStatus = "pending" | "running" | "succeeded" | "failed";

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
  resultId?: string;
  imageUrl?: string;
  error?: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
};
