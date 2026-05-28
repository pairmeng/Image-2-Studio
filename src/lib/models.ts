export type ProviderId = string;

export type ProviderAdapterId = "openai" | "openai-compatible" | "mock";

export type ProviderInputTransport = "multipart" | "base64" | "public-url";

export type ImageMode = "text-to-image" | "image-to-image";

export type ImageCapability = ImageMode | "continue-edit";

export type ModelDefinition = {
  provider: ProviderId;
  adapterId?: ProviderAdapterId;
  modelId: string;
  label: string;
  description: string;
  capabilities: ImageCapability[];
  defaultSize?: string;
  supportedSizes?: string[];
  defaultAspectRatio?: string;
  supportedAspectRatios?: string[];
  defaultQuality?: string;
  qualityOptions?: string[];
  inputFidelityOptions?: string[];
  supportsCustomSize?: boolean;
  maxPromptLength?: number;
  maxReferenceImages?: number;
  referenceInputTransport?: ProviderInputTransport[];
  estimatedCostUnits?: number;
};

export type ProviderStatus = {
  provider: ProviderId;
  label: string;
  adapterId?: ProviderAdapterId;
  configured: boolean;
  enabled?: boolean;
  supportsCustomSize?: boolean;
  baseUrlConfigured?: boolean;
  source?: "user" | "platform" | "env" | "none";
};

export const OPENAI_PROVIDER_ID = "openai";
export const OPENAI_MODEL_ID = "gpt-image-2";

export const PROVIDERS: Array<Omit<ProviderStatus, "configured" | "supportsCustomSize" | "baseUrlConfigured">> = [
  { provider: OPENAI_PROVIDER_ID, label: "OpenAI", adapterId: "openai", enabled: true }
];

export const COMMON_ASPECT_RATIOS = ["auto", "1:1", "3:4", "4:3", "9:16", "16:9", "2:3", "3:2", "1:2", "2:1"];

export const MODEL_CATALOG: ModelDefinition[] = [
  {
    provider: OPENAI_PROVIDER_ID,
    adapterId: "openai",
    modelId: OPENAI_MODEL_ID,
    label: "GPT Image 2",
    description: "OpenAI image model for generation, reference images, and iterative edits.",
    capabilities: ["text-to-image", "image-to-image", "continue-edit"],
    defaultSize: "1024x1024",
    supportedSizes: ["1024x1024", "1536x1024", "1024x1536"],
    defaultAspectRatio: "3:4",
    supportedAspectRatios: COMMON_ASPECT_RATIOS,
    defaultQuality: "medium",
    qualityOptions: ["low", "medium", "high"],
    inputFidelityOptions: ["high", "low"],
    supportsCustomSize: false,
    maxPromptLength: 2000,
    maxReferenceImages: 4,
    referenceInputTransport: ["multipart", "base64"]
  }
];

export function getModelsForProvider(provider: ProviderId) {
  return MODEL_CATALOG.filter((model) => model.provider === provider);
}

export function getModel(provider: ProviderId, modelId: string) {
  return MODEL_CATALOG.find((model) => model.provider === provider && model.modelId === modelId);
}

export function createOpenAICompatibleModel(modelId: string, provider: ProviderId = OPENAI_PROVIDER_ID): ModelDefinition {
  return {
    provider,
    adapterId: "openai-compatible",
    modelId,
    label: modelId,
    description: "OpenAI-compatible image model from custom provider settings.",
    capabilities: ["text-to-image", "image-to-image", "continue-edit"],
    defaultSize: "1024x1024",
    supportedSizes: ["1024x1024", "1536x1024", "1024x1536"],
    defaultAspectRatio: "3:4",
    supportedAspectRatios: COMMON_ASPECT_RATIOS,
    defaultQuality: "medium",
    qualityOptions: ["low", "medium", "high"],
    inputFidelityOptions: ["high", "low"],
    supportsCustomSize: true,
    maxPromptLength: 2000,
    maxReferenceImages: 4,
    referenceInputTransport: ["multipart", "base64"]
  };
}

export function createGenericProviderModel(input: {
  provider: ProviderId;
  adapterId: ProviderAdapterId;
  modelId: string;
  label?: string;
  supportsCustomSize?: boolean;
}): ModelDefinition {
  return {
    provider: input.provider,
    adapterId: input.adapterId,
    modelId: input.modelId,
    label: input.label?.trim() || input.modelId,
    description: "Custom image model from provider settings.",
    capabilities: ["text-to-image", "image-to-image"],
    defaultSize: "1024x1024",
    supportedSizes: ["1024x1024", "1536x1024", "1024x1536"],
    defaultAspectRatio: "3:4",
    supportedAspectRatios: COMMON_ASPECT_RATIOS,
    defaultQuality: "medium",
    qualityOptions: ["low", "medium", "high"],
    inputFidelityOptions: ["high", "low"],
    supportsCustomSize: input.supportsCustomSize ?? true,
    maxPromptLength: 2000,
    maxReferenceImages: 4,
    referenceInputTransport: ["multipart", "base64"]
  };
}

export function modelSupports(model: ModelDefinition | undefined, capability: ImageCapability) {
  return Boolean(model?.capabilities.includes(capability));
}

export function isProviderId(value: string | null): value is ProviderId {
  return Boolean(value && /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(value));
}

export function isImageMode(value: string | null): value is ImageMode {
  return value === "text-to-image" || value === "image-to-image";
}

export function isProviderAdapterId(value: string | null | undefined): value is ProviderAdapterId {
  return value === "openai" || value === "openai-compatible" || value === "mock";
}
