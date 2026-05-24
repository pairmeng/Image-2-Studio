import type { ImageMode, ModelDefinition } from "../models";

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

export type ImageProvider = {
  createImage(request: ProviderRequest): Promise<ProviderResult>;
};
