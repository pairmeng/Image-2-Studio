import type { ProviderId } from "../models";
import { getPublicImageQueueSettingsFromRecord, type PublicImageQueueSettings } from "./image-queue-settings";
import { decryptSecret, encryptSecret } from "./crypto";
import { prisma } from "./db";

export const DEFAULT_SITE_TITLE = "Image-2 Studio";

type ProviderSource = "user" | "platform" | "env" | "none";

export type PublicProviderConfig = {
  activeProvider?: ProviderId;
  keys: Record<ProviderId, { configured: boolean; source: ProviderSource }>;
  baseUrls: Partial<Record<ProviderId, string>>;
  models: Partial<Record<ProviderId, string>>;
  supportsCustomSize?: Partial<Record<ProviderId, boolean>>;
};

export type PublicPlatformProviderConfig = {
  keys: Record<ProviderId, { configured: boolean }>;
  baseUrls: Partial<Record<ProviderId, string>>;
  models: Partial<Record<ProviderId, string>>;
};

export type ResolvedProviderConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  source: ProviderSource;
};

type AppSettings = {
  id: string;
  registrationOpen: boolean;
  dailyPlatformQuota: number;
  siteTitle?: string | null;
  faviconUrl?: string | null;
  logoUrl?: string | null;
  imageQueueMode?: string | null;
  imageJobConcurrency?: number | null;
  imageJobUserConcurrency?: number | null;
  imageQueueRedisUrlEncrypted?: string | null;
  imageQueuePrefix?: string | null;
  imageWorkerConcurrency?: number | null;
  imageQueueAttempts?: number | null;
  imageQueueBackoffMs?: number | null;
};

export type PublicAppSettings = Omit<AppSettings, "imageQueueRedisUrlEncrypted"> & PublicImageQueueSettings;

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

export function sanitizeLogoUrl(value: unknown) {
  return sanitizeFaviconUrl(value);
}

export function getPublicBranding(settings: { siteTitle?: string | null; faviconUrl?: string | null; logoUrl?: string | null }) {
  return {
    siteTitle: settings.siteTitle?.trim() || DEFAULT_SITE_TITLE,
    faviconUrl: settings.faviconUrl?.trim() || "",
    logoUrl: settings.logoUrl?.trim() || ""
  };
}

function getEnvKey(_provider: ProviderId) {
  return process.env.OPENAI_API_KEY ?? "";
}

function getEnvBaseUrl(_provider: ProviderId) {
  return process.env.OPENAI_BASE_URL ?? "";
}

function getEnvModel(_provider: ProviderId) {
  return process.env.OPENAI_IMAGE_MODEL ?? "";
}

function providerFields(_provider: ProviderId) {
  return {
    key: "openaiKeyEncrypted",
    baseUrl: "openaiBaseUrl",
    model: "openaiModel"
  } as const;
}

function toProviderId(value: string | null | undefined): ProviderId | undefined {
  return value === "openai" ? value : undefined;
}

const DEFAULT_APP_SETTINGS: AppSettings = {
  id: "settings",
  registrationOpen: false,
  dailyPlatformQuota: 20,
  siteTitle: null,
  faviconUrl: null,
  logoUrl: null,
  imageQueueMode: null,
  imageJobConcurrency: null,
  imageJobUserConcurrency: null,
  imageQueueRedisUrlEncrypted: null,
  imageQueuePrefix: null,
  imageWorkerConcurrency: null,
  imageQueueAttempts: null,
  imageQueueBackoffMs: null
};

export async function readAppSettings(): Promise<AppSettings> {
  return await prisma.appSetting.findUnique({ where: { id: "settings" } }) ?? DEFAULT_APP_SETTINGS;
}

export function toPublicAppSettings(settings: AppSettings): PublicAppSettings {
  const { imageQueueRedisUrlEncrypted: _redisUrl, ...safeSettings } = settings;
  return {
    ...safeSettings,
    ...getPublicImageQueueSettingsFromRecord(settings)
  };
}

export async function readPublicAppSettings(): Promise<PublicAppSettings> {
  return toPublicAppSettings(await readAppSettings());
}

export async function getAppSettings() {
  return prisma.appSetting.upsert({
    where: { id: "settings" },
    update: {},
    create: { id: "settings" }
  });
}

async function getProviderConfigSnapshot(userId: string) {
  const [userConfig, platformConfig] = await Promise.all([
    prisma.providerConfig.findUnique({ where: { userId } }),
    prisma.platformProviderConfig.findUnique({ where: { id: "platform" } })
  ]);

  return { userConfig, platformConfig };
}

function resolveProviderConfig(
  provider: ProviderId,
  snapshot: Awaited<ReturnType<typeof getProviderConfigSnapshot>>
): ResolvedProviderConfig {
  const fields = providerFields(provider);
  const { userConfig, platformConfig } = snapshot;

  const userEncrypted = userConfig?.[fields.key];
  if (userEncrypted) {
    return {
      apiKey: decryptSecret(userEncrypted),
      baseUrl: fields.baseUrl ? userConfig?.[fields.baseUrl] ?? "" : "",
      model: userConfig?.[fields.model] ?? "",
      source: "user"
    };
  }

  const platformEncrypted = platformConfig?.[fields.key];
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

export async function getResolvedProviderConfig(userId: string, provider: ProviderId): Promise<ResolvedProviderConfig> {
  return resolveProviderConfig(provider, await getProviderConfigSnapshot(userId));
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
  const snapshot = await getProviderConfigSnapshot(userId);
  const { userConfig } = snapshot;
  const providers: ProviderId[] = ["openai"];
  const resolvedPairs = providers.map((provider) => [provider, resolveProviderConfig(provider, snapshot)] as const);
  const resolvedOpenAI = resolvedPairs.find(([provider]) => provider === "openai")?.[1];

  return {
    activeProvider: toProviderId(userConfig?.activeProvider),
    baseUrls: {
      openai: userConfig?.openaiBaseUrl ?? resolvedOpenAI?.baseUrl ?? ""
    },
    models: {
      openai: userConfig?.openaiModel ?? resolvedOpenAI?.model ?? ""
    },
    supportsCustomSize: {
      openai: Boolean(resolvedOpenAI?.baseUrl)
    },
    keys: resolvedPairs.reduce<PublicProviderConfig["keys"]>((acc, [provider, resolved]) => {
      acc[provider] = {
        configured: Boolean(resolved.apiKey),
        source: resolved.source
      };
      return acc;
    }, {
      openai: { configured: false, source: "none" }
    })
  };
}

export async function getPublicPlatformProviderConfig(): Promise<PublicPlatformProviderConfig> {
  const platformConfig = await prisma.platformProviderConfig.findUnique({ where: { id: "platform" } });

  return {
    baseUrls: {
      openai: platformConfig?.openaiBaseUrl ?? ""
    },
    models: {
      openai: platformConfig?.openaiModel ?? ""
    },
    keys: {
      openai: {
        configured: Boolean(platformConfig?.openaiKeyEncrypted)
      }
    }
  };
}

export async function getUserProviderSettings(userId: string): Promise<PublicProviderConfig> {
  const userConfig = await prisma.providerConfig.findUnique({ where: { userId } });
  const hasOpenAIKey = Boolean(userConfig?.openaiKeyEncrypted);

  return {
    activeProvider: toProviderId(userConfig?.activeProvider),
    baseUrls: {
      openai: userConfig?.openaiBaseUrl ?? ""
    },
    models: {
      openai: userConfig?.openaiModel ?? ""
    },
    keys: {
      openai: {
        configured: hasOpenAIKey,
        source: hasOpenAIKey ? "user" : "none"
      }
    }
  };
}

export async function saveProviderConfig(userId: string, input: {
  activeProvider?: ProviderId;
  keys?: Partial<Record<ProviderId, string>>;
  baseUrls?: Partial<Record<ProviderId, string>>;
  models?: Partial<Record<ProviderId, string>>;
}) {
  const current = await prisma.providerConfig.findUnique({ where: { userId } });
  const data: {
    activeProvider?: string | null;
    openaiKeyEncrypted?: string;
    openaiBaseUrl?: string | null;
    openaiModel?: string | null;
  } = {
    activeProvider: input.activeProvider ?? current?.activeProvider ?? undefined,
    openaiKeyEncrypted: current?.openaiKeyEncrypted ?? undefined,
    openaiBaseUrl: current?.openaiBaseUrl ?? undefined,
    openaiModel: current?.openaiModel ?? undefined
  };

  if (typeof input.keys?.openai === "string" && input.keys.openai.trim()) {
    data.openaiKeyEncrypted = encryptSecret(input.keys.openai.trim());
  }

  if (typeof input.baseUrls?.openai === "string") {
    data.openaiBaseUrl = input.baseUrls.openai.trim().replace(/\/+$/, "") || null;
  }

  if (typeof input.models?.openai === "string") {
    data.openaiModel = input.models.openai.trim() || null;
  }

  await prisma.providerConfig.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data
  });

  return getUserProviderSettings(userId);
}

export async function savePlatformProviderConfig(input: {
  keys?: Partial<Record<ProviderId, string>>;
  baseUrls?: Partial<Record<ProviderId, string>>;
  models?: Partial<Record<ProviderId, string>>;
}) {
  const current = await prisma.platformProviderConfig.findUnique({ where: { id: "platform" } });
  const data: {
    openaiKeyEncrypted?: string;
    openaiBaseUrl?: string | null;
    openaiModel?: string | null;
  } = {
    openaiKeyEncrypted: current?.openaiKeyEncrypted ?? undefined,
    openaiBaseUrl: current?.openaiBaseUrl ?? undefined,
    openaiModel: current?.openaiModel ?? undefined
  };

  if (typeof input.keys?.openai === "string" && input.keys.openai.trim()) {
    data.openaiKeyEncrypted = encryptSecret(input.keys.openai.trim());
  }

  if (typeof input.baseUrls?.openai === "string") {
    data.openaiBaseUrl = input.baseUrls.openai.trim().replace(/\/+$/, "") || null;
  }

  if (typeof input.models?.openai === "string") {
    data.openaiModel = input.models.openai.trim() || null;
  }

  return prisma.platformProviderConfig.upsert({
    where: { id: "platform" },
    create: { id: "platform", ...data },
    update: data
  });
}
