import { decryptSecret, encryptSecret, sha256 } from "./crypto";
import { prisma } from "./db";

export type ImageQueueMode = "inline" | "redis";
export type ImageQueueConfigSource = "database" | "env" | "default" | "mixed";

export const DEFAULT_IMAGE_JOB_CONCURRENCY = 2;
export const MAX_IMAGE_JOB_CONCURRENCY = 8;
export const DEFAULT_IMAGE_QUEUE_PREFIX = "image2";
export const DEFAULT_IMAGE_WORKER_CONCURRENCY = 8;
export const DEFAULT_IMAGE_QUEUE_ATTEMPTS = 3;
export const DEFAULT_IMAGE_QUEUE_BACKOFF_MS = 5000;
export const MAX_IMAGE_WORKER_CONCURRENCY = 64;
export const MAX_IMAGE_QUEUE_ATTEMPTS = 20;
export const MAX_IMAGE_QUEUE_BACKOFF_MS = 10 * 60 * 1000;

const SETTINGS_CACHE_TTL_MS = 5000;

export type ImageQueueSettingsRecord = {
  imageQueueMode?: string | null;
  imageJobConcurrency?: number | null;
  imageJobUserConcurrency?: number | null;
  imageQueueRedisUrlEncrypted?: string | null;
  imageQueuePrefix?: string | null;
  imageWorkerConcurrency?: number | null;
  imageQueueAttempts?: number | null;
  imageQueueBackoffMs?: number | null;
  updatedAt?: Date | string | null;
};

export type EffectiveImageQueueSettings = {
  mode: ImageQueueMode;
  source: ImageQueueConfigSource;
  version: string;
  queueRuntimeVersion: string;
  workerRuntimeVersion: string;
  redisUrl: string;
  redisUrlHash: string;
  redisConfigured: boolean;
  redisTarget: string;
  imageJobConcurrency: number;
  imageJobUserConcurrency: number;
  imageQueuePrefix: string;
  imageWorkerConcurrency: number;
  imageQueueAttempts: number;
  imageQueueBackoffMs: number;
};

export type PublicImageQueueSettings = {
  imageQueueMode: ImageQueueMode;
  imageQueueConfigSource: ImageQueueConfigSource;
  imageQueueConfigVersion: string;
  imageQueueRuntimeVersion: string;
  imageWorkerRuntimeVersion: string;
  imageQueueRedisConfigured: boolean;
  imageQueueRedisTarget: string;
  imageJobConcurrency: number;
  imageJobUserConcurrency: number;
  imageQueuePrefix: string;
  imageWorkerConcurrency: number;
  imageQueueAttempts: number;
  imageQueueBackoffMs: number;
};

export type ImageQueueSettingsUpdateInput = {
  imageQueueMode?: unknown;
  imageJobConcurrency?: unknown;
  imageJobUserConcurrency?: unknown;
  imageQueueRedisUrl?: unknown;
  clearImageQueueRedisUrl?: unknown;
  imageQueuePrefix?: unknown;
  imageWorkerConcurrency?: unknown;
  imageQueueAttempts?: unknown;
  imageQueueBackoffMs?: unknown;
};

export type ImageQueueSettingsUpdateResult = {
  data: Partial<{
    imageQueueMode: ImageQueueMode | null;
    imageJobConcurrency: number | null;
    imageJobUserConcurrency: number | null;
    imageQueueRedisUrlEncrypted: string | null;
    imageQueuePrefix: string | null;
    imageWorkerConcurrency: number | null;
    imageQueueAttempts: number | null;
    imageQueueBackoffMs: number | null;
  }>;
  error?: string;
};

type QueueSettingsEnv = Partial<Record<
  "REDIS_URL"
  | "IMAGE_QUEUE_PREFIX"
  | "IMAGE_JOB_CONCURRENCY"
  | "IMAGE_JOB_USER_CONCURRENCY"
  | "IMAGE_WORKER_CONCURRENCY"
  | "IMAGE_QUEUE_ATTEMPTS"
  | "IMAGE_QUEUE_BACKOFF_MS",
  string
>>;

function getRuntimeEnv(): QueueSettingsEnv {
  return {
    REDIS_URL: process.env.REDIS_URL,
    IMAGE_QUEUE_PREFIX: process.env.IMAGE_QUEUE_PREFIX,
    IMAGE_JOB_CONCURRENCY: process.env.IMAGE_JOB_CONCURRENCY,
    IMAGE_JOB_USER_CONCURRENCY: process.env.IMAGE_JOB_USER_CONCURRENCY,
    IMAGE_WORKER_CONCURRENCY: process.env.IMAGE_WORKER_CONCURRENCY,
    IMAGE_QUEUE_ATTEMPTS: process.env.IMAGE_QUEUE_ATTEMPTS,
    IMAGE_QUEUE_BACKOFF_MS: process.env.IMAGE_QUEUE_BACKOFF_MS
  };
}

let cachedSettings: EffectiveImageQueueSettings | null = null;
let cachedAt = 0;

function normalizeInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = typeof value === "number"
    ? value
    : Number.parseInt(typeof value === "string" ? value : "", 10);

  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

function normalizeOptionalInteger(value: unknown, min: number, max: number) {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = typeof value === "number"
    ? value
    : Number.parseInt(typeof value === "string" ? value : "", 10);

  if (!Number.isFinite(parsed)) return undefined;
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

function normalizeMode(value: unknown): ImageQueueMode | undefined {
  return value === "inline" || value === "redis" ? value : undefined;
}

export function sanitizeImageQueuePrefix(value: unknown) {
  if (typeof value !== "string") return undefined;

  const prefix = value.trim().slice(0, 40);
  if (!prefix || !/^[a-zA-Z0-9:_-]+$/.test(prefix)) return undefined;

  return prefix;
}

export function sanitizeRedisUrl(value: unknown) {
  if (typeof value !== "string") return undefined;

  const redisUrl = value.trim();
  if (!redisUrl) return "";

  try {
    const parsed = new URL(redisUrl);
    if (parsed.protocol !== "redis:" && parsed.protocol !== "rediss:") return undefined;
    if (!parsed.hostname) return undefined;
    return redisUrl.slice(0, 1000);
  } catch {
    return undefined;
  }
}

export function getRedisTarget(redisUrl: string) {
  if (!redisUrl) return "disabled";

  try {
    const url = new URL(redisUrl);
    const db = url.pathname && url.pathname !== "/" ? url.pathname : "";
    return `${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ""}${db}`;
  } catch {
    return "invalid Redis URL";
  }
}

function decryptStoredRedisUrl(record: ImageQueueSettingsRecord | null | undefined) {
  const encrypted = record?.imageQueueRedisUrlEncrypted?.trim();
  if (!encrypted) return "";

  try {
    return decryptSecret(encrypted);
  } catch (error) {
    console.warn("[image-queue-settings] could not decrypt stored Redis URL", {
      cause: error instanceof Error ? error.message : String(error)
    });
    return "";
  }
}

function getSource(flags: boolean[]) {
  if (flags.every(Boolean)) return "database";
  if (flags.some(Boolean)) return "mixed";
  return "env";
}

export function resolveImageQueueSettings(
  record: ImageQueueSettingsRecord | null | undefined,
  env: QueueSettingsEnv = getRuntimeEnv()
): EffectiveImageQueueSettings {
  const storedRedisUrl = decryptStoredRedisUrl(record);
  const envRedisUrl = env.REDIS_URL?.trim() || "";
  const hasDbMode = Boolean(normalizeMode(record?.imageQueueMode));
  const hasDbRedisUrl = Boolean(record?.imageQueueRedisUrlEncrypted);
  const hasDbPrefix = Boolean(record?.imageQueuePrefix?.trim());
  const hasDbJobConcurrency = typeof record?.imageJobConcurrency === "number";
  const hasDbUserConcurrency = typeof record?.imageJobUserConcurrency === "number";
  const hasDbWorkerConcurrency = typeof record?.imageWorkerConcurrency === "number";
  const hasDbAttempts = typeof record?.imageQueueAttempts === "number";
  const hasDbBackoff = typeof record?.imageQueueBackoffMs === "number";

  const imageJobConcurrency = normalizeInteger(
    hasDbJobConcurrency ? record?.imageJobConcurrency : env.IMAGE_JOB_CONCURRENCY,
    DEFAULT_IMAGE_JOB_CONCURRENCY,
    1,
    MAX_IMAGE_JOB_CONCURRENCY
  );
  const defaultUserConcurrency = Math.max(1, Math.ceil(imageJobConcurrency / 2));
  const imageJobUserConcurrency = normalizeInteger(
    hasDbUserConcurrency ? record?.imageJobUserConcurrency : env.IMAGE_JOB_USER_CONCURRENCY,
    defaultUserConcurrency,
    1,
    imageJobConcurrency
  );
  const imageQueuePrefix = sanitizeImageQueuePrefix(hasDbPrefix ? record?.imageQueuePrefix : env.IMAGE_QUEUE_PREFIX)
    ?? DEFAULT_IMAGE_QUEUE_PREFIX;
  const imageWorkerConcurrency = normalizeInteger(
    hasDbWorkerConcurrency ? record?.imageWorkerConcurrency : env.IMAGE_WORKER_CONCURRENCY,
    DEFAULT_IMAGE_WORKER_CONCURRENCY,
    1,
    MAX_IMAGE_WORKER_CONCURRENCY
  );
  const imageQueueAttempts = normalizeInteger(
    hasDbAttempts ? record?.imageQueueAttempts : env.IMAGE_QUEUE_ATTEMPTS,
    DEFAULT_IMAGE_QUEUE_ATTEMPTS,
    1,
    MAX_IMAGE_QUEUE_ATTEMPTS
  );
  const imageQueueBackoffMs = normalizeInteger(
    hasDbBackoff ? record?.imageQueueBackoffMs : env.IMAGE_QUEUE_BACKOFF_MS,
    DEFAULT_IMAGE_QUEUE_BACKOFF_MS,
    0,
    MAX_IMAGE_QUEUE_BACKOFF_MS
  );

  const redisUrl = hasDbRedisUrl ? storedRedisUrl : envRedisUrl;
  const envMode: ImageQueueMode = envRedisUrl ? "redis" : "inline";
  const mode = normalizeMode(record?.imageQueueMode) ?? envMode;
  const redisUrlHash = redisUrl ? sha256(redisUrl) : "";
  const source = getSource([
    hasDbMode,
    hasDbRedisUrl,
    hasDbPrefix,
    hasDbJobConcurrency,
    hasDbUserConcurrency,
    hasDbWorkerConcurrency,
    hasDbAttempts,
    hasDbBackoff
  ]);
  const signatureBase = {
    mode,
    redisUrlHash,
    imageQueuePrefix,
    imageJobConcurrency,
    imageJobUserConcurrency,
    imageWorkerConcurrency,
    imageQueueAttempts,
    imageQueueBackoffMs
  };
  const version = sha256(JSON.stringify(signatureBase)).slice(0, 16);
  const queueRuntimeVersion = sha256(JSON.stringify({
    mode,
    redisUrlHash,
    imageQueuePrefix
  })).slice(0, 16);
  const workerRuntimeVersion = sha256(JSON.stringify({
    mode,
    redisUrlHash,
    imageQueuePrefix,
    imageWorkerConcurrency
  })).slice(0, 16);

  return {
    mode,
    source: source === "env" && !envRedisUrl && !env.IMAGE_JOB_CONCURRENCY ? "default" : source,
    version,
    queueRuntimeVersion,
    workerRuntimeVersion,
    redisUrl,
    redisUrlHash,
    redisConfigured: Boolean(redisUrl),
    redisTarget: getRedisTarget(redisUrl),
    imageJobConcurrency,
    imageJobUserConcurrency,
    imageQueuePrefix,
    imageWorkerConcurrency,
    imageQueueAttempts,
    imageQueueBackoffMs
  };
}

export function toPublicImageQueueSettings(settings: EffectiveImageQueueSettings): PublicImageQueueSettings {
  return {
    imageQueueMode: settings.mode,
    imageQueueConfigSource: settings.source,
    imageQueueConfigVersion: settings.version,
    imageQueueRuntimeVersion: settings.queueRuntimeVersion,
    imageWorkerRuntimeVersion: settings.workerRuntimeVersion,
    imageQueueRedisConfigured: settings.redisConfigured,
    imageQueueRedisTarget: settings.redisTarget,
    imageJobConcurrency: settings.imageJobConcurrency,
    imageJobUserConcurrency: settings.imageJobUserConcurrency,
    imageQueuePrefix: settings.imageQueuePrefix,
    imageWorkerConcurrency: settings.imageWorkerConcurrency,
    imageQueueAttempts: settings.imageQueueAttempts,
    imageQueueBackoffMs: settings.imageQueueBackoffMs
  };
}

export function getPublicImageQueueSettingsFromRecord(
  record: ImageQueueSettingsRecord | null | undefined,
  env: QueueSettingsEnv = getRuntimeEnv()
) {
  return toPublicImageQueueSettings(resolveImageQueueSettings(record, env));
}

export function getCachedImageQueueSettings() {
  if (!cachedSettings) {
    cachedSettings = resolveImageQueueSettings(null);
    cachedAt = Date.now();
  }

  return cachedSettings;
}

export function invalidateImageQueueSettingsCache() {
  cachedAt = 0;
}

export async function refreshImageQueueSettings(options: { force?: boolean } = {}) {
  const now = Date.now();
  if (!options.force && cachedSettings && now - cachedAt < SETTINGS_CACHE_TTL_MS) {
    return cachedSettings;
  }

  const record = await prisma.appSetting.findUnique({ where: { id: "settings" } }) as ImageQueueSettingsRecord | null;
  cachedSettings = resolveImageQueueSettings(record);
  cachedAt = now;
  return cachedSettings;
}

export function getImageQueueSettingsUpdate(input: ImageQueueSettingsUpdateInput): ImageQueueSettingsUpdateResult {
  const data: ImageQueueSettingsUpdateResult["data"] = {};

  if (input.imageQueueMode !== undefined) {
    const mode = normalizeMode(input.imageQueueMode);
    if (!mode) return { data, error: "Queue mode must be inline or redis." };
    data.imageQueueMode = mode;
  }

  if (input.imageJobConcurrency !== undefined) {
    data.imageJobConcurrency = normalizeOptionalInteger(input.imageJobConcurrency, 1, MAX_IMAGE_JOB_CONCURRENCY);
    if (data.imageJobConcurrency === undefined) return { data, error: "Image job concurrency is invalid." };
  }

  if (input.imageJobUserConcurrency !== undefined) {
    const maxUserConcurrency = typeof data.imageJobConcurrency === "number"
      ? data.imageJobConcurrency
      : MAX_IMAGE_JOB_CONCURRENCY;
    data.imageJobUserConcurrency = normalizeOptionalInteger(input.imageJobUserConcurrency, 1, maxUserConcurrency);
    if (data.imageJobUserConcurrency === undefined) return { data, error: "Per-user image job concurrency is invalid." };
  }

  if (input.imageQueuePrefix !== undefined) {
    const prefix = sanitizeImageQueuePrefix(input.imageQueuePrefix);
    if (!prefix) return { data, error: "Queue prefix may only contain letters, numbers, colon, underscore, and dash." };
    data.imageQueuePrefix = prefix;
  }

  if (input.imageWorkerConcurrency !== undefined) {
    data.imageWorkerConcurrency = normalizeOptionalInteger(input.imageWorkerConcurrency, 1, MAX_IMAGE_WORKER_CONCURRENCY);
    if (data.imageWorkerConcurrency === undefined) return { data, error: "Worker concurrency is invalid." };
  }

  if (input.imageQueueAttempts !== undefined) {
    data.imageQueueAttempts = normalizeOptionalInteger(input.imageQueueAttempts, 1, MAX_IMAGE_QUEUE_ATTEMPTS);
    if (data.imageQueueAttempts === undefined) return { data, error: "Queue retry attempts is invalid." };
  }

  if (input.imageQueueBackoffMs !== undefined) {
    data.imageQueueBackoffMs = normalizeOptionalInteger(input.imageQueueBackoffMs, 0, MAX_IMAGE_QUEUE_BACKOFF_MS);
    if (data.imageQueueBackoffMs === undefined) return { data, error: "Queue backoff delay is invalid." };
  }

  if (input.clearImageQueueRedisUrl === true) {
    data.imageQueueRedisUrlEncrypted = null;
  } else if (input.imageQueueRedisUrl !== undefined) {
    const redisUrl = sanitizeRedisUrl(input.imageQueueRedisUrl);
    if (redisUrl === undefined) return { data, error: "Redis URL must use redis:// or rediss://." };
    if (redisUrl) {
      data.imageQueueRedisUrlEncrypted = encryptSecret(redisUrl);
    }
  }

  return { data };
}
