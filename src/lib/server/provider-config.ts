import type { ProviderId } from "../models";
import { decryptSecret, encryptSecret } from "./crypto";
import { prisma } from "./db";

export const DEFAULT_SITE_TITLE = "Image-2 Studio";

type ProviderSource = "user" | "platform" | "env" | "none";

export type PublicProviderConfig = {
  activeProvider?: ProviderId;
  keys: Record<ProviderId, { configured: boolean; source: ProviderSource }>;
  baseUrls: Partial<Record<ProviderId, string>>;
  models: Partial<Record<ProviderId, string>>;
};

export type ResolvedProviderConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  source: ProviderSource;
};

export function sanitizeSiteTitle(value: unknown) {
  if (typeof value !== "string") return undefined;

  const title = value.trim();
  if (!title) return null;

  return title.slice(0, 80);
}

export function sanitizeFaviconUrl(value: unknown) {
  if (typeof value !== "string") return undefined;

  const url = value.trim();
  if (!url) return null;

  const limited = url.slice(0, 500);
  if ((limited.startsWith("/") && !limited.startsWith("//")) || /^https?:\/\//i.test(limited)) {
    return limited;
  }

  return undefined;
}

export function getPublicBranding(settings: { siteTitle?: string | null; faviconUrl?: string | null }) {
  return {
    siteTitle: settings.siteTitle?.trim() || DEFAULT_SITE_TITLE,
    faviconUrl: settings.faviconUrl?.trim() || ""
  };
}

function getEnvKey(provider: ProviderId) {
  if (provider === "openai") return process.env.OPENAI_API_KEY ?? "";
  return process.env.FAL_KEY ?? "";
}

function getEnvBaseUrl(provider: ProviderId) {
  if (provider === "openai") return process.env.OPENAI_BASE_URL ?? "";
  return "";
}

function getEnvModel(provider: ProviderId) {
  if (provider === "openai") return process.env.OPENAI_IMAGE_MODEL ?? "";
  if (provider === "fal") return process.env.FAL_IMAGE_MODEL ?? "";
  return "";
}

function providerFields(provider: ProviderId) {
  if (provider === "openai") {
    return {
      key: "openaiKeyEncrypted",
      baseUrl: "openaiBaseUrl",
      model: "openaiModel"
    } as const;
  }

  return {
    key: "falKeyEncrypted",
    baseUrl: undefined,
    model: "falModel"
  } as const;
}

function toProviderId(value: string | null | undefined): ProviderId | undefined {
  return value === "openai" || value === "fal" ? value : undefined;
}

export async function getAppSettings() {
  return prisma.appSetting.upsert({
    where: { id: "settings" },
    update: {},
    create: { id: "settings" }
  });
}

export async function getResolvedProviderConfig(userId: string, provider: ProviderId): Promise<ResolvedProviderConfig> {
  const fields = providerFields(provider);
  const [userConfig, platformConfig] = await Promise.all([
    prisma.providerConfig.findUnique({ where: { userId } }),
    prisma.platformProviderConfig.upsert({
      where: { id: "platform" },
      update: {},
      create: { id: "platform" }
    })
  ]);

  const userEncrypted = userConfig?.[fields.key];
  if (userEncrypted) {
    return {
      apiKey: decryptSecret(userEncrypted),
      baseUrl: fields.baseUrl ? userConfig?.[fields.baseUrl] ?? "" : "",
      model: userConfig?.[fields.model] ?? "",
      source: "user"
    };
  }

  const platformEncrypted = platformConfig[fields.key];
  if (platformEncrypted) {
    return {
      apiKey: decryptSecret(platformEncrypted),
      baseUrl: fields.baseUrl ? platformConfig[fields.baseUrl] ?? "" : "",
      model: platformConfig[fields.model] ?? "",
      source: "platform"
    };
  }

  const envKey = getEnvKey(provider);
  if (envKey) {
    return {
      apiKey: envKey,
      baseUrl: getEnvBaseUrl(provider),
      model: getEnvModel(provider),
      source: "env"
    };
  }

  return { apiKey: "", baseUrl: "", model: "", source: "none" };
}

export async function getProviderApiKey(userId: string, provider: ProviderId) {
  return (await getResolvedProviderConfig(userId, provider)).apiKey;
}

export async function getProviderBaseUrl(userId: string, provider: ProviderId) {
  return (await getResolvedProviderConfig(userId, provider)).baseUrl;
}

export async function getProviderModel(userId: string, provider: ProviderId) {
  return (await getResolvedProviderConfig(userId, provider)).model;
}

export async function isProviderConfigured(userId: string, provider: ProviderId) {
  return Boolean((await getResolvedProviderConfig(userId, provider)).apiKey);
}

export async function getPublicProviderConfig(userId: string): Promise<PublicProviderConfig> {
  const userConfig = await prisma.providerConfig.findUnique({ where: { userId } });
  const providers: ProviderId[] = ["openai", "fal"];
  const resolvedPairs = await Promise.all(providers.map(async (provider) => [provider, await getResolvedProviderConfig(userId, provider)] as const));

  return {
    activeProvider: toProviderId(userConfig?.activeProvider),
    baseUrls: {
      openai: userConfig?.openaiBaseUrl ?? resolvedPairs.find(([provider]) => provider === "openai")?.[1].baseUrl ?? ""
    },
    models: {
      openai: userConfig?.openaiModel ?? resolvedPairs.find(([provider]) => provider === "openai")?.[1].model ?? "",
      fal: userConfig?.falModel ?? resolvedPairs.find(([provider]) => provider === "fal")?.[1].model ?? ""
    },
    keys: resolvedPairs.reduce<PublicProviderConfig["keys"]>((acc, [provider, resolved]) => {
      acc[provider] = {
        configured: Boolean(resolved.apiKey),
        source: resolved.source
      };
      return acc;
    }, {
      openai: { configured: false, source: "none" },
      fal: { configured: false, source: "none" }
    })
  };
}

export async function saveProviderConfig(userId: string, input: {
  activeProvider?: ProviderId;
  keys?: Partial<Record<ProviderId, string>>;
  baseUrls?: Partial<Record<ProviderId, string>>;
  models?: Partial<Record<ProviderId, string>>;
}) {
  const current = await prisma.providerConfig.findUnique({ where: { userId } });
  const data = {
    activeProvider: input.activeProvider ?? current?.activeProvider ?? undefined,
    openaiKeyEncrypted: current?.openaiKeyEncrypted ?? undefined,
    falKeyEncrypted: current?.falKeyEncrypted ?? undefined,
    openaiBaseUrl: current?.openaiBaseUrl ?? undefined,
    openaiModel: current?.openaiModel ?? undefined,
    falModel: current?.falModel ?? undefined
  };

  if (typeof input.keys?.openai === "string" && input.keys.openai.trim()) {
    data.openaiKeyEncrypted = encryptSecret(input.keys.openai.trim());
  }

  if (typeof input.keys?.fal === "string" && input.keys.fal.trim()) {
    data.falKeyEncrypted = encryptSecret(input.keys.fal.trim());
  }

  if (typeof input.baseUrls?.openai === "string") {
    data.openaiBaseUrl = input.baseUrls.openai.trim().replace(/\/+$/, "") || undefined;
  }

  if (typeof input.models?.openai === "string") {
    data.openaiModel = input.models.openai.trim() || undefined;
  }

  if (typeof input.models?.fal === "string") {
    data.falModel = input.models.fal.trim() || undefined;
  }

  await prisma.providerConfig.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data
  });

  return getPublicProviderConfig(userId);
}

export async function savePlatformProviderConfig(input: {
  keys?: Partial<Record<ProviderId, string>>;
  baseUrls?: Partial<Record<ProviderId, string>>;
  models?: Partial<Record<ProviderId, string>>;
}) {
  const current = await prisma.platformProviderConfig.upsert({
    where: { id: "platform" },
    update: {},
    create: { id: "platform" }
  });
  const data = {
    openaiKeyEncrypted: current.openaiKeyEncrypted ?? undefined,
    falKeyEncrypted: current.falKeyEncrypted ?? undefined,
    openaiBaseUrl: current.openaiBaseUrl ?? undefined,
    openaiModel: current.openaiModel ?? undefined,
    falModel: current.falModel ?? undefined
  };

  if (typeof input.keys?.openai === "string" && input.keys.openai.trim()) {
    data.openaiKeyEncrypted = encryptSecret(input.keys.openai.trim());
  }

  if (typeof input.keys?.fal === "string" && input.keys.fal.trim()) {
    data.falKeyEncrypted = encryptSecret(input.keys.fal.trim());
  }

  if (typeof input.baseUrls?.openai === "string") {
    data.openaiBaseUrl = input.baseUrls.openai.trim().replace(/\/+$/, "") || undefined;
  }

  if (typeof input.models?.openai === "string") {
    data.openaiModel = input.models.openai.trim() || undefined;
  }

  if (typeof input.models?.fal === "string") {
    data.falModel = input.models.fal.trim() || undefined;
  }

  return prisma.platformProviderConfig.update({
    where: { id: "platform" },
    data
  });
}
