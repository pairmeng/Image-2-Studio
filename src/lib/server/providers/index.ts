import type { ProviderAdapterId, ProviderId } from "../../models";
import type { ImageProvider } from "../provider-types";
import { isProviderConfigured as isProviderConfiguredFromConfig } from "../provider-config";
import { mockProvider } from "./mock";
import { openaiProvider } from "./openai";

export type ProviderAdapterSummary = {
  adapterId: ProviderAdapterId;
  label: string;
};

const providerAdapters: Record<ProviderAdapterId, ImageProvider> = {
  openai: openaiProvider,
  "openai-compatible": {
    ...openaiProvider,
    adapterId: "openai-compatible",
    label: "OpenAI-compatible"
  },
  mock: mockProvider
};

export function getProviderAdapter(adapterId: ProviderAdapterId): ImageProvider {
  return providerAdapters[adapterId] ?? providerAdapters.openai;
}

export function getProvider(_provider: ProviderId, adapterId: ProviderAdapterId = "openai"): ImageProvider {
  return getProviderAdapter(adapterId);
}

export function listProviderAdapters(): ProviderAdapterSummary[] {
  return Object.entries(providerAdapters).map(([adapterId, adapter]) => ({
    adapterId: adapterId as ProviderAdapterId,
    label: adapter.label ?? adapterId
  }));
}

export async function isProviderConfigured(userId: string, provider: ProviderId) {
  return isProviderConfiguredFromConfig(userId, provider);
}
