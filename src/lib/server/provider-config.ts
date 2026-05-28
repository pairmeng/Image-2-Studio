import {
  createGenericProviderModel,
  createOpenAICompatibleModel,
  getModel,
  isProviderAdapterId,
  OPENAI_MODEL_ID,
  OPENAI_PROVIDER_ID,
  type ModelDefinition,
  type ProviderAdapterId,
  type ProviderId
} from "../models";
import { getPublicImageQueueSettingsFromRecord, type PublicImageQueueSettings } from "./image-queue-settings";
import { decryptSecret, encryptSecret } from "./crypto";
import { prisma } from "./db";
import { AppError } from "./errors";

export const DEFAULT_SITE_TITLE = "Image-2 Studio";

export type ProviderSource = "user" | "platform" | "env" | "none";

export type PublicProviderConfig = {
  activeProvider?: ProviderId;
  providers: PublicProviderSummary[];
  keys: Record<string, { configured: boolean; source: ProviderSource }>;
  baseUrls: Record<string, string>;
  models: Record<string, string>;
  supportsCustomSize?: Record<string, boolean>;
};

export type PublicProviderSummary = {
  provider: string;
  providerId: string;
  adapterId: ProviderAdapterId;
  label: string;
  enabled: boolean;
  configured: boolean;
  source: ProviderSource;
  baseUrlConfigured: boolean;
  supportsCustomSize: boolean;
  defaultModel?: string;
  healthStatus?: string;
};

export type PublicPlatformProviderConfig = {
  providers: PublicProviderSummary[];
  keys: Record<string, { configured: boolean }>;
  baseUrls: Record<string, string>;
  models: Record<string, string>;
};

export type AdminProviderSetting = PublicProviderSummary & {
  baseUrl: string;
  baseUrlHost: string;
  defaultModel: string;
  modelCount: number;
  models: Array<{ modelId: string; label: string }>;
  priority: number;
  healthMessage?: string | null;
  lastHealthCheckAt?: string | null;
  updatedAt: string;
};

export type ResolvedProviderConfig = {
  providerId: string;
  adapterId: ProviderAdapterId;
  label: string;
  enabled: boolean;
  apiKey: string;
  baseUrl: string;
  model: string;
  models: ModelDefinition[];
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

type PlatformProviderSettingRecord = {
  id: string;
  providerId: string;
  adapterId: string;
  label: string;
  enabled: boolean;
  keyEncrypted: string | null;
  baseUrl: string | null;
  defaultModel: string | null;
  modelsJson: string;
  capabilitiesJson: string;
  priority: number;
  healthStatus: string;
  healthMessage: string | null;
  lastHealthCheckAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type UserProviderSettingRecord = {
  id: string;
  userId: string;
  providerId: string;
  enabled: boolean;
  keyEncrypted: string | null;
  baseUrl: string | null;
  defaultModel: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type LegacyProviderConfigRecord = {
  activeProvider: string | null;
  openaiKeyEncrypted: string | null;
  openaiBaseUrl: string | null;
  openaiModel: string | null;
};

type LegacyPlatformProviderConfigRecord = {
  openaiKeyEncrypted: string | null;
  openaiBaseUrl: string | null;
  openaiModel: string | null;
};

type ProviderSettingClient = {
  findMany(input?: { where?: Record<string, unknown>; orderBy?: Record<string, unknown> | Array<Record<string, unknown>>; include?: Record<string, unknown> }): Promise<Array<PlatformProviderSettingRecord & { userSettings?: UserProviderSettingRecord[] }>>;
  findUnique(input: { where: { providerId?: string; id?: string } }): Promise<PlatformProviderSettingRecord | null>;
  upsert(input: { where: { providerId: string }; create: Record<string, unknown>; update: Record<string, unknown> }): Promise<PlatformProviderSettingRecord>;
  update(input: { where: { providerId: string }; data: Record<string, unknown> }): Promise<PlatformProviderSettingRecord>;
  count(input?: { where?: Record<string, unknown> }): Promise<number>;
};

type UserProviderSettingClient = {
  findMany(input: { where?: Record<string, unknown> }): Promise<UserProviderSettingRecord[]>;
  findUnique(input: { where: { userId_providerId: { userId: string; providerId: string } } }): Promise<UserProviderSettingRecord | null>;
  upsert(input: { where: { userId_providerId: { userId: string; providerId: string } }; create: Record<string, unknown>; update: Record<string, unknown> }): Promise<UserProviderSettingRecord>;
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

function getEnvKey(provider: ProviderId) {
  return provider === OPENAI_PROVIDER_ID ? process.env.OPENAI_API_KEY ?? "" : "";
}

function getEnvBaseUrl(provider: ProviderId) {
  return provider === OPENAI_PROVIDER_ID ? process.env.OPENAI_BASE_URL ?? "" : "";
}

function getEnvModel(provider: ProviderId) {
  return provider === OPENAI_PROVIDER_ID ? process.env.OPENAI_IMAGE_MODEL ?? "" : "";
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

const DEFAULT_OPENAI_PROVIDER: PlatformProviderSettingRecord = {
  id: "platform-openai",
  providerId: OPENAI_PROVIDER_ID,
  adapterId: "openai",
  label: "OpenAI",
  enabled: true,
  keyEncrypted: null,
  baseUrl: null,
  defaultModel: OPENAI_MODEL_ID,
  modelsJson: "[]",
  capabilitiesJson: "{}",
  priority: 10,
  healthStatus: "unknown",
  healthMessage: null,
  lastHealthCheckAt: null,
  createdAt: new Date(0),
  updatedAt: new Date(0)
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

function platformProviderSettingClient() {
  return (prisma as unknown as { platformProviderSetting?: ProviderSettingClient }).platformProviderSetting;
}

function userProviderSettingClient() {
  return (prisma as unknown as { userProviderSetting?: UserProviderSettingClient }).userProviderSetting;
}

function normalizeAdapterId(adapterId: string | null | undefined, baseUrl?: string | null): ProviderAdapterId {
  if (isProviderAdapterId(adapterId)) return adapterId;
  return baseUrl ? "openai-compatible" : "openai";
}

function sanitizeProviderId(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 64);
}

function sanitizeProviderLabel(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  return value.trim().slice(0, 80) || fallback;
}

function sanitizeProviderBaseUrl(value: unknown) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "https:") return trimmed;
    if (process.env.NODE_ENV !== "production" && parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname)) {
      return trimmed;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function sanitizeProviderModel(value: unknown) {
  if (typeof value !== "string") return undefined;
  return value.trim().slice(0, 120) || null;
}

function sanitizeProviderPriority(value: unknown) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.min(Math.max(parsed, 1), 1000);
}

function parseJsonArray(value: string | null | undefined): unknown[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseConfiguredModels(setting: PlatformProviderSettingRecord): ModelDefinition[] {
  const adapterId = normalizeAdapterId(setting.adapterId, setting.baseUrl);
  const supportsCustomSize = adapterId !== "openai" || Boolean(setting.baseUrl);
  const customModels = parseJsonArray(setting.modelsJson)
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const raw = item as Record<string, unknown>;
      const modelId = typeof raw.modelId === "string" ? raw.modelId.trim() : "";
      if (!modelId) return null;
      return createGenericProviderModel({
        provider: setting.providerId,
        adapterId,
        modelId,
        label: typeof raw.label === "string" ? raw.label : undefined,
        supportsCustomSize
      });
    })
    .filter((item): item is ModelDefinition => Boolean(item));

  const defaultModel = setting.defaultModel?.trim();
  if (setting.providerId === OPENAI_PROVIDER_ID) {
    const catalog = getModel(OPENAI_PROVIDER_ID, OPENAI_MODEL_ID);
    const baseModel = supportsCustomSize && defaultModel && defaultModel !== OPENAI_MODEL_ID
      ? createOpenAICompatibleModel(defaultModel, setting.providerId)
      : catalog;
    const models = [
      ...(baseModel ? [{ ...baseModel, adapterId, supportsCustomSize }] : []),
      ...customModels.filter((model) => model.modelId !== baseModel?.modelId)
    ];
    return models.length > 0 ? models : [createOpenAICompatibleModel(defaultModel || OPENAI_MODEL_ID, setting.providerId)];
  }

  if (customModels.length > 0) return customModels;

  return [createGenericProviderModel({
    provider: setting.providerId,
    adapterId,
    modelId: defaultModel || `${setting.providerId}-image`,
    supportsCustomSize
  })];
}

function getProviderHost(baseUrl: string | null | undefined) {
  if (!baseUrl) return "";
  try {
    return new URL(baseUrl).host;
  } catch {
    return "";
  }
}

function toPublicProviderSummary(input: {
  setting: PlatformProviderSettingRecord;
  configured: boolean;
  source: ProviderSource;
  baseUrl: string;
  model: string;
}): PublicProviderSummary {
  const adapterId = normalizeAdapterId(input.setting.adapterId, input.baseUrl);
  return {
    provider: input.setting.providerId,
    providerId: input.setting.providerId,
    adapterId,
    label: input.setting.label,
    enabled: input.setting.enabled,
    configured: input.configured,
    source: input.source,
    baseUrlConfigured: Boolean(input.baseUrl),
    supportsCustomSize: adapterId !== "openai" || Boolean(input.baseUrl),
    defaultModel: input.model || undefined,
    healthStatus: input.setting.healthStatus
  };
}

async function readLegacySnapshot(userId?: string) {
  const [userConfig, platformConfig] = await Promise.all([
    userId ? prisma.providerConfig.findUnique({ where: { userId } }) as Promise<LegacyProviderConfigRecord | null> : Promise.resolve(null),
    prisma.platformProviderConfig.findUnique({ where: { id: "platform" } }) as Promise<LegacyPlatformProviderConfigRecord | null>
  ]);

  return { userConfig, platformConfig };
}

async function ensureOpenAIProviderSetting(): Promise<PlatformProviderSettingRecord> {
  const client = platformProviderSettingClient();
  if (!client) return DEFAULT_OPENAI_PROVIDER;

  const existingCount = await client.count().catch(() => 0);
  if (existingCount > 0) {
    const openai = await client.findUnique({ where: { providerId: OPENAI_PROVIDER_ID } }).catch(() => null);
    return openai ?? DEFAULT_OPENAI_PROVIDER;
  }

  const { platformConfig } = await readLegacySnapshot();
  const baseUrl = platformConfig?.openaiBaseUrl ?? "";
  const defaultModel = platformConfig?.openaiModel ?? OPENAI_MODEL_ID;

  return client.upsert({
    where: { providerId: OPENAI_PROVIDER_ID },
    create: {
      id: "platform-openai",
      providerId: OPENAI_PROVIDER_ID,
      adapterId: baseUrl ? "openai-compatible" : "openai",
      label: "OpenAI",
      enabled: true,
      keyEncrypted: platformConfig?.openaiKeyEncrypted ?? undefined,
      baseUrl: baseUrl || undefined,
      defaultModel,
      modelsJson: "[]",
      capabilitiesJson: "{}",
      priority: 10,
      healthStatus: "unknown"
    },
    update: {}
  });
}

export async function listPlatformProviderSettings(): Promise<PlatformProviderSettingRecord[]> {
  const client = platformProviderSettingClient();
  if (!client) return [DEFAULT_OPENAI_PROVIDER];

  const providers = await client.findMany({ orderBy: [{ priority: "asc" }, { label: "asc" }] }).catch(() => []);
  if (providers.length > 0) return providers;

  return [await ensureOpenAIProviderSetting()];
}

async function getPlatformProviderSetting(providerId: string) {
  const client = platformProviderSettingClient();
  if (!client) return providerId === OPENAI_PROVIDER_ID ? DEFAULT_OPENAI_PROVIDER : null;

  const provider = await client.findUnique({ where: { providerId } }).catch(() => null);
  if (provider) return provider;
  if (providerId === OPENAI_PROVIDER_ID) return ensureOpenAIProviderSetting();

  return null;
}

async function getUserProviderSetting(userId: string, providerId: string) {
  const client = userProviderSettingClient();
  if (!client) return null;
  return client.findUnique({ where: { userId_providerId: { userId, providerId } } }).catch(() => null);
}

function resolveProviderConfigFromRecords(input: {
  provider: PlatformProviderSettingRecord;
  userSetting?: UserProviderSettingRecord | null;
  legacyUser?: LegacyProviderConfigRecord | null;
  legacyPlatform?: LegacyPlatformProviderConfigRecord | null;
}): ResolvedProviderConfig {
  const providerId = input.provider.providerId;
  const adapterId = normalizeAdapterId(input.provider.adapterId, input.provider.baseUrl);
  const legacyApplies = providerId === OPENAI_PROVIDER_ID;

  const userKey = input.userSetting?.keyEncrypted
    ?? (legacyApplies ? input.legacyUser?.openaiKeyEncrypted ?? null : null);
  if (input.userSetting?.enabled !== false && userKey) {
    const userBaseUrl = input.userSetting?.baseUrl ?? (legacyApplies ? input.legacyUser?.openaiBaseUrl ?? "" : "");
    return {
      providerId,
      adapterId: normalizeAdapterId(input.provider.adapterId, userBaseUrl || input.provider.baseUrl),
      label: input.provider.label,
      enabled: input.provider.enabled,
      apiKey: decryptSecret(userKey),
      baseUrl: userBaseUrl ?? "",
      model: input.userSetting?.defaultModel ?? (legacyApplies ? input.legacyUser?.openaiModel : null) ?? input.provider.defaultModel ?? "",
      models: parseConfiguredModels(input.provider),
      source: "user"
    };
  }

  if (input.provider.keyEncrypted) {
    return {
      providerId,
      adapterId,
      label: input.provider.label,
      enabled: input.provider.enabled,
      apiKey: decryptSecret(input.provider.keyEncrypted),
      baseUrl: input.provider.baseUrl ?? "",
      model: input.provider.defaultModel ?? "",
      models: parseConfiguredModels(input.provider),
      source: "platform"
    };
  }

  const legacyPlatformKey = legacyApplies ? input.legacyPlatform?.openaiKeyEncrypted : null;
  if (legacyPlatformKey) {
    const baseUrl = input.legacyPlatform?.openaiBaseUrl ?? "";
    return {
      providerId,
      adapterId: normalizeAdapterId(input.provider.adapterId, baseUrl),
      label: input.provider.label,
      enabled: input.provider.enabled,
      apiKey: decryptSecret(legacyPlatformKey),
      baseUrl,
      model: input.legacyPlatform?.openaiModel ?? input.provider.defaultModel ?? "",
      models: parseConfiguredModels(input.provider),
      source: "platform"
    };
  }

  const envKey = getEnvKey(providerId);
  if (envKey) {
    const baseUrl = getEnvBaseUrl(providerId);
    return {
      providerId,
      adapterId: normalizeAdapterId(input.provider.adapterId, baseUrl),
      label: input.provider.label,
      enabled: input.provider.enabled,
      apiKey: envKey,
      baseUrl,
      model: getEnvModel(providerId) || input.provider.defaultModel || "",
      models: parseConfiguredModels(input.provider),
      source: "env"
    };
  }

  return {
    providerId,
    adapterId,
    label: input.provider.label,
    enabled: input.provider.enabled,
    apiKey: "",
    baseUrl: input.provider.baseUrl ?? "",
    model: input.provider.defaultModel ?? "",
    models: parseConfiguredModels(input.provider),
    source: "none"
  };
}

export async function getResolvedProviderConfig(userId: string, provider: ProviderId): Promise<ResolvedProviderConfig> {
  const setting = await getPlatformProviderSetting(provider);
  if (!setting) {
    return {
      providerId: provider,
      adapterId: "openai",
      label: provider,
      enabled: false,
      apiKey: "",
      baseUrl: "",
      model: "",
      models: [],
      source: "none"
    };
  }

  const [userSetting, legacy] = await Promise.all([
    getUserProviderSetting(userId, provider),
    readLegacySnapshot(userId)
  ]);

  return resolveProviderConfigFromRecords({
    provider: setting,
    userSetting,
    legacyUser: legacy.userConfig,
    legacyPlatform: legacy.platformConfig
  });
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
  const resolved = await getResolvedProviderConfig(userId, provider);
  return resolved.enabled && Boolean(resolved.apiKey);
}

export async function getPublicProviderConfig(userId: string): Promise<PublicProviderConfig> {
  const [providers, userSettings, legacy] = await Promise.all([
    listPlatformProviderSettings(),
    userProviderSettingClient()?.findMany({ where: { userId } }).catch(() => []) ?? Promise.resolve([]),
    readLegacySnapshot(userId)
  ]);
  const userMap = new Map(userSettings.map((setting) => [setting.providerId, setting]));
  const summaries: PublicProviderSummary[] = [];
  const keys: PublicProviderConfig["keys"] = {};
  const baseUrls: PublicProviderConfig["baseUrls"] = {};
  const models: PublicProviderConfig["models"] = {};
  const supportsCustomSize: Record<string, boolean> = {};

  for (const provider of providers) {
    const resolved = resolveProviderConfigFromRecords({
      provider,
      userSetting: userMap.get(provider.providerId),
      legacyUser: legacy.userConfig,
      legacyPlatform: legacy.platformConfig
    });
    const summary = toPublicProviderSummary({
      setting: provider,
      configured: Boolean(resolved.apiKey),
      source: resolved.source,
      baseUrl: resolved.baseUrl,
      model: resolved.model
    });
    summaries.push(summary);
    keys[provider.providerId] = {
      configured: summary.configured,
      source: summary.source
    };
    baseUrls[provider.providerId] = resolved.baseUrl;
    models[provider.providerId] = resolved.model;
    supportsCustomSize[provider.providerId] = summary.supportsCustomSize;
  }

  return {
    activeProvider: legacy.userConfig?.activeProvider ?? summaries.find((item) => item.enabled && item.configured)?.providerId ?? summaries[0]?.providerId,
    providers: summaries,
    baseUrls,
    models,
    supportsCustomSize,
    keys
  };
}

export async function getPublicPlatformProviderConfig(): Promise<PublicPlatformProviderConfig> {
  const providers = await listPlatformProviderSettings();
  const summaries: PublicProviderSummary[] = providers.map((provider) => toPublicProviderSummary({
    setting: provider,
    configured: Boolean(provider.keyEncrypted),
    source: provider.keyEncrypted ? "platform" : "none",
    baseUrl: provider.baseUrl ?? "",
    model: provider.defaultModel ?? ""
  }));
  const keys: PublicPlatformProviderConfig["keys"] = {};
  const baseUrls: PublicPlatformProviderConfig["baseUrls"] = {};
  const models: PublicPlatformProviderConfig["models"] = {};

  for (const provider of providers) {
    keys[provider.providerId] = { configured: Boolean(provider.keyEncrypted) };
    baseUrls[provider.providerId] = provider.baseUrl ?? "";
    models[provider.providerId] = provider.defaultModel ?? "";
  }

  return { providers: summaries, baseUrls, models, keys };
}

function toAdminProviderSetting(provider: PlatformProviderSettingRecord): AdminProviderSetting {
  const models = parseConfiguredModels(provider).map((model) => ({
    modelId: model.modelId,
    label: model.label
  }));
  const summary = toPublicProviderSummary({
    setting: provider,
    configured: Boolean(provider.keyEncrypted),
    source: provider.keyEncrypted ? "platform" : "none",
    baseUrl: provider.baseUrl ?? "",
    model: provider.defaultModel ?? ""
  });

  return {
    ...summary,
    baseUrl: provider.baseUrl ?? "",
    baseUrlHost: getProviderHost(provider.baseUrl),
    defaultModel: provider.defaultModel ?? "",
    modelCount: models.length,
    models,
    priority: provider.priority,
    healthMessage: provider.healthMessage,
    lastHealthCheckAt: provider.lastHealthCheckAt?.toISOString() ?? null,
    updatedAt: provider.updatedAt.toISOString()
  };
}

export async function listAdminProviderSettings(): Promise<AdminProviderSetting[]> {
  return (await listPlatformProviderSettings()).map(toAdminProviderSetting);
}

export async function getAdminProviderSetting(providerId: string): Promise<AdminProviderSetting | null> {
  const provider = await getPlatformProviderSetting(providerId);
  return provider ? toAdminProviderSetting(provider) : null;
}

export async function getUserProviderSettings(userId: string): Promise<PublicProviderConfig> {
  return getPublicProviderConfig(userId);
}

export async function saveProviderConfig(userId: string, input: {
  activeProvider?: ProviderId;
  keys?: Partial<Record<ProviderId, string>>;
  baseUrls?: Partial<Record<ProviderId, string>>;
  models?: Partial<Record<ProviderId, string>>;
}) {
  const providerIds = new Set([
    ...Object.keys(input.keys ?? {}),
    ...Object.keys(input.baseUrls ?? {}),
    ...Object.keys(input.models ?? {}),
    input.activeProvider
  ].filter((item): item is string => Boolean(item)));

  const client = userProviderSettingClient();
  if (!client) return getUserProviderSettings(userId);

  for (const providerId of providerIds) {
    const platform = await getPlatformProviderSetting(providerId);
    if (!platform) continue;

    const current = await getUserProviderSetting(userId, providerId);
    const update: Record<string, unknown> = {
      enabled: true
    };

    const key = input.keys?.[providerId];
    if (typeof key === "string" && key.trim()) {
      update.keyEncrypted = encryptSecret(key.trim());
    }

    const baseUrl = sanitizeProviderBaseUrl(input.baseUrls?.[providerId]);
    if (baseUrl !== undefined) {
      update.baseUrl = baseUrl;
    }

    const model = sanitizeProviderModel(input.models?.[providerId]);
    if (model !== undefined) {
      update.defaultModel = model;
    }

    await client.upsert({
      where: { userId_providerId: { userId, providerId } },
      create: {
        userId,
        providerId,
        enabled: true,
        keyEncrypted: typeof key === "string" && key.trim() ? encryptSecret(key.trim()) : undefined,
        baseUrl: baseUrl === undefined ? current?.baseUrl ?? undefined : baseUrl,
        defaultModel: model === undefined ? current?.defaultModel ?? undefined : model
      },
      update
    });
  }

  return getUserProviderSettings(userId);
}

export type SavePlatformProviderSettingInput = {
  providerId?: string;
  adapterId?: string;
  label?: string;
  enabled?: boolean;
  key?: string;
  baseUrl?: string;
  defaultModel?: string;
  models?: Array<{ modelId: string; label?: string }>;
  priority?: number;
};

export async function savePlatformProviderSetting(providerIdInput: string, input: SavePlatformProviderSettingInput) {
  const client = platformProviderSettingClient();
  if (!client) throw new Error("Provider setting database client is not ready. Please regenerate Prisma Client.");

  const providerId = sanitizeProviderId(input.providerId ?? providerIdInput);
  if (!providerId) throw new AppError("Provider id is invalid.", 400);

  const existing = await getPlatformProviderSetting(providerId);
  const baseUrl = sanitizeProviderBaseUrl(input.baseUrl);
  if (input.baseUrl !== undefined && baseUrl === undefined) {
    throw new AppError("Provider Base URL is invalid.", 400);
  }

  const defaultModel = sanitizeProviderModel(input.defaultModel);
  const priority = sanitizeProviderPriority(input.priority);
  const adapterId = normalizeAdapterId(input.adapterId, baseUrl === undefined ? existing?.baseUrl : baseUrl);
  const modelsJson = input.models
    ? JSON.stringify(input.models
      .map((item) => ({
        modelId: typeof item.modelId === "string" ? item.modelId.trim().slice(0, 120) : "",
        label: typeof item.label === "string" ? item.label.trim().slice(0, 120) : undefined
      }))
      .filter((item) => item.modelId))
    : undefined;
  const keyEncrypted = typeof input.key === "string" && input.key.trim()
    ? encryptSecret(input.key.trim())
    : undefined;

  const data: Record<string, unknown> = {
    providerId,
    adapterId,
    label: sanitizeProviderLabel(input.label, existing?.label ?? providerId),
    enabled: typeof input.enabled === "boolean" ? input.enabled : existing?.enabled ?? true,
    ...(keyEncrypted ? { keyEncrypted } : {}),
    ...(baseUrl !== undefined ? { baseUrl } : {}),
    ...(defaultModel !== undefined ? { defaultModel } : {}),
    ...(modelsJson !== undefined ? { modelsJson } : {}),
    ...(priority !== undefined ? { priority } : {})
  };

  return client.upsert({
    where: { providerId },
    create: {
      id: `platform-${providerId}`,
      capabilitiesJson: "{}",
      healthStatus: "unknown",
      priority: 100,
      modelsJson: "[]",
      ...data
    },
    update: data
  });
}

export async function savePlatformProviderConfig(input: {
  keys?: Partial<Record<ProviderId, string>>;
  baseUrls?: Partial<Record<ProviderId, string>>;
  models?: Partial<Record<ProviderId, string>>;
}) {
  const providerId = OPENAI_PROVIDER_ID;
  return savePlatformProviderSetting(providerId, {
    providerId,
    adapterId: input.baseUrls?.openai ? "openai-compatible" : undefined,
    label: "OpenAI",
    enabled: true,
    key: input.keys?.openai,
    baseUrl: input.baseUrls?.openai,
    defaultModel: input.models?.openai
  });
}

export async function updateProviderHealth(providerId: string, input: {
  ok: boolean;
  message: string;
}) {
  const client = platformProviderSettingClient();
  if (!client) return null;

  return client.update({
    where: { providerId },
    data: {
      healthStatus: input.ok ? "healthy" : "failing",
      healthMessage: input.message.slice(0, 500),
      lastHealthCheckAt: new Date()
    }
  });
}

export function getModelsForResolvedProvider(config: ResolvedProviderConfig) {
  if (config.models.length > 0) return config.models;

  if (config.providerId === OPENAI_PROVIDER_ID) {
    return [config.baseUrl ? createOpenAICompatibleModel(config.model || OPENAI_MODEL_ID) : getModel(OPENAI_PROVIDER_ID, OPENAI_MODEL_ID)]
      .filter((item): item is ModelDefinition => Boolean(item));
  }

  return [createGenericProviderModel({
    provider: config.providerId,
    adapterId: config.adapterId,
    modelId: config.model || `${config.providerId}-image`,
    supportsCustomSize: config.adapterId !== "openai"
  })];
}
