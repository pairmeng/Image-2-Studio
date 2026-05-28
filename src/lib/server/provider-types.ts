import type { ImageMode, ModelDefinition, ProviderAdapterId } from "../models";

export type InputImage = {
  filename: string;
  mimeType: string;
  buffer: Buffer;
  publicUrl?: string;
};

export type ProviderRequest = {
  credentials: {
    apiKey: string;
    baseUrl?: string;
  };
  model: ModelDefinition;
  mode: ImageMode;
  prompt: string;
  size?: string;
  aspectRatio?: string;
  quality?: string;
  inputFidelity?: string;
  inputImages: InputImage[];
};

export type ProviderResult = {
  imageBuffer: Buffer;
  mimeType: string;
  providerMeta?: Record<string, unknown>;
};

export type ProviderRuntimeConfig = {
  providerId: string;
  adapterId: ProviderAdapterId;
  label: string;
  enabled: boolean;
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
  models: ModelDefinition[];
  source: "user" | "platform" | "env" | "none";
};

export type ProviderFailure = {
  code: string;
  category: string;
  message: string;
};

export type ImageProvider = {
  adapterId?: ProviderAdapterId;
  label?: string;
  createImage(request: ProviderRequest): Promise<ProviderResult>;
  testConnection?(config: ProviderRuntimeConfig): Promise<{ ok: boolean; message: string }>;
  sanitizeMeta?(meta: Record<string, unknown>): Record<string, unknown>;
};
