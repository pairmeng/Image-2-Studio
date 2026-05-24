export type ProviderId = "openai" | "fal";

export type ImageMode = "text-to-image" | "image-to-image";

export type ImageCapability = ImageMode | "continue-edit";

export type ModelDefinition = {
  provider: ProviderId;
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
};

export type ProviderStatus = {
  provider: ProviderId;
  label: string;
  configured: boolean;
};

export const PROVIDERS: Array<Omit<ProviderStatus, "configured">> = [
  { provider: "openai", label: "OpenAI" },
  { provider: "fal", label: "fal" }
];

export const COMMON_ASPECT_RATIOS = ["auto", "1:1", "3:4", "4:3", "9:16", "16:9", "2:3", "3:2", "1:2", "2:1"];

export const MODEL_CATALOG: ModelDefinition[] = [
  {
    provider: "openai",
    modelId: "gpt-image-2",
    label: "GPT Image 2",
    description: "OpenAI image model for generation, reference images, and iterative edits.",
    capabilities: ["text-to-image", "image-to-image", "continue-edit"],
    defaultSize: "1024x1024",
    supportedSizes: ["1024x1024", "1536x1024", "1024x1536"],
    defaultAspectRatio: "3:4",
    supportedAspectRatios: COMMON_ASPECT_RATIOS,
    defaultQuality: "medium",
    qualityOptions: ["low", "medium", "high"],
    inputFidelityOptions: ["high", "low"]
  },
  {
    provider: "fal",
    modelId: "fal-ai/flux/dev",
    label: "FLUX.1 dev",
    description: "fal-hosted FLUX text-to-image model. Image edit is reserved for later models.",
    capabilities: ["text-to-image"],
    defaultAspectRatio: "3:4",
    supportedAspectRatios: COMMON_ASPECT_RATIOS,
    defaultQuality: "standard",
    qualityOptions: ["standard"]
  }
];

export function getModelsForProvider(provider: ProviderId) {
  return MODEL_CATALOG.filter((model) => model.provider === provider);
}

export function getModel(provider: ProviderId, modelId: string) {
  return MODEL_CATALOG.find((model) => model.provider === provider && model.modelId === modelId);
}

export function createOpenAICompatibleModel(modelId: string): ModelDefinition {
  return {
    provider: "openai",
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
    inputFidelityOptions: ["high", "low"]
  };
}

export function createFalTextModel(modelId: string): ModelDefinition {
  return {
    provider: "fal",
    modelId,
    label: modelId,
    description: "fal text-to-image model from custom provider settings.",
    capabilities: ["text-to-image"],
    defaultAspectRatio: "3:4",
    supportedAspectRatios: COMMON_ASPECT_RATIOS,
    defaultQuality: "standard",
    qualityOptions: ["standard"]
  };
}

export function modelSupports(model: ModelDefinition, capability: ImageCapability) {
  return model.capabilities.includes(capability);
}

export function isProviderId(value: string | null): value is ProviderId {
  return value === "openai" || value === "fal";
}

export function isImageMode(value: string | null): value is ImageMode {
  return value === "text-to-image" || value === "image-to-image";
}
