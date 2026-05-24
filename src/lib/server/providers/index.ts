import type { ProviderId } from "../../models";
import type { ImageProvider } from "../provider-types";
import { isProviderConfigured as isProviderConfiguredFromConfig } from "../provider-config";
import { falProvider } from "./fal";
import { openaiProvider } from "./openai";

export function getProvider(provider: ProviderId): ImageProvider {
  if (provider === "openai") return openaiProvider;
  return falProvider;
}

export async function isProviderConfigured(userId: string, provider: ProviderId) {
  return isProviderConfiguredFromConfig(userId, provider);
}
