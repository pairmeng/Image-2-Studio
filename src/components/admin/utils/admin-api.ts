import type { PublicUser } from "@/lib/types";
import { fetchJson } from "@/components/studio/utils/api-client";

export type AdminOverview = {
  totals: {
    users: number;
    disabledUsers: number;
    images: number;
    jobs: number;
  };
  today: {
    platformUses: number;
    generatedImages: number;
    failedJobs: number;
  };
  settings: {
    registrationOpen: boolean;
    dailyPlatformQuota: number;
    siteTitle?: string | null;
    faviconUrl?: string | null;
    logoUrl?: string | null;
    imageQueueMode: "inline" | "redis";
    imageQueueConfigSource: "database" | "env" | "default" | "mixed";
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
  platformProvider: {
    keys: Record<string, { configured: boolean }>;
    baseUrls: Record<string, string | undefined>;
    models: Record<string, string | undefined>;
  };
  jobQueue: AdminJobQueueSnapshot;
  users: PublicUser[];
  images: Array<{
    id: string;
    userEmail: string;
    provider: string;
    model: string;
    prompt: string;
    createdAt: string;
  }>;
  usage: Array<{
    id: string;
    userEmail: string;
    date: string;
    platformUses: number;
  }>;
};

export type AdminProviderSetting = {
  provider: string;
  providerId: string;
  adapterId: "openai" | "openai-compatible" | "mock";
  label: string;
  enabled: boolean;
  configured: boolean;
  source: "user" | "platform" | "env" | "none";
  baseUrlConfigured: boolean;
  supportsCustomSize: boolean;
  defaultModel?: string;
  healthStatus?: string;
  baseUrl: string;
  baseUrlHost: string;
  modelCount: number;
  models: Array<{ modelId: string; label: string }>;
  priority: number;
  healthMessage?: string | null;
  lastHealthCheckAt?: string | null;
  updatedAt: string;
};

export type AdminProvidersResponse = {
  providers: AdminProviderSetting[];
  adapters: Array<{ adapterId: AdminProviderSetting["adapterId"]; label: string }>;
};

export type AdminProviderSaveInput = {
  providerId: string;
  adapterId: AdminProviderSetting["adapterId"];
  label: string;
  enabled: boolean;
  key: string;
  baseUrl: string;
  defaultModel: string;
  models: Array<{ modelId: string; label?: string }>;
  priority: number;
};

export type AdminJobQueueSnapshot = {
  workerId?: string;
  backend?: "redis" | "inline";
  configSource?: "database" | "env" | "default" | "mixed";
  configVersion?: string;
  queueRuntimeVersion?: string;
  workerRuntimeVersion?: string;
  queue: {
    enabled: boolean;
    ok: boolean;
    target: string;
    error?: string;
  };
  bullmq?: {
    waiting: number;
    active: number;
    delayed: number;
    failed: number;
    completed: number;
  };
  redisTarget?: string;
  redisConfigured?: boolean;
  queuePrefix?: string;
  attempts?: number;
  backoffMs?: number;
  concurrency: number;
  userConcurrency: number;
  workerConcurrency?: number;
  active: number;
  queued: number;
  pending: number;
  running: number;
  recentFailed: number;
  recentSucceeded: number;
  recent: {
    inspected: number;
    averageQueueWaitMs: number | null;
    averageExecutionMs: number | null;
    averageUpstreamMs: number | null;
    averageFileSaveMs: number | null;
  };
  providerHealth: Array<{
    provider: string;
    status: "healthy" | "degraded" | "failing" | "idle";
    total: number;
    succeeded: number;
    failed: number;
    failureRate: number;
    averageExecutionMs: number | null;
    averageUpstreamMs: number | null;
  }>;
  modelUsage: Array<{
    provider: string;
    model: string;
    total: number;
    succeeded: number;
    failed: number;
    averageExecutionMs: number | null;
  }>;
  failureReasons: Array<{
    reason: string;
    count: number;
    sample: string;
    latestAt: string;
  }>;
};

export type AdminSettingsSaveInput = AdminOverview["settings"] & {
  imageQueueRedisUrl?: string;
  clearImageQueueRedisUrl?: boolean;
};

export type AdminImageRecord = {
  id: string;
  userId: string;
  userEmail: string;
  createdAt: string;
  provider: string;
  model: string;
  mode: string;
  prompt: string;
  imageUrl: string;
  thumbnailUrl: string;
  imagePath: string;
  size?: string;
  aspectRatio?: string;
  quality?: string;
  inputFidelity?: string;
  batchId?: string;
  projectId?: string;
  tags: string[];
};

export type AdminImagesResponse = {
  records: AdminImageRecord[];
  nextCursor?: string;
};

export type AdminUsageResponse = {
  range: "7d" | "30d";
  daily: Array<{
    date: string;
    platformUses: number;
    images: number;
    succeededJobs: number;
    failedJobs: number;
  }>;
  users: Array<{
    userId: string;
    userEmail: string;
    platformUses: number;
    images: number;
    succeededJobs: number;
    failedJobs: number;
  }>;
  models: Array<{
    provider: string;
    model: string;
    images: number;
    jobs: number;
  }>;
};

export type AdminMonitorResponse = {
  jobQueue: AdminJobQueueSnapshot;
  recentJobs: Array<{
    id: string;
    userEmail: string;
    status: string;
    provider: string;
    model: string;
    prompt: string;
    queueWaitMs?: number;
    executionMs?: number;
    upstreamMs?: number;
    fileSaveMs?: number;
    error?: string;
    createdAt: string;
    startedAt?: string;
    finishedAt?: string;
  }>;
};

export type AdminJobRecord = {
  id: string;
  userId: string;
  userEmail: string;
  status: string;
  provider: string;
  model: string;
  mode: string;
  prompt: string;
  batchId?: string;
  batchItemId?: string;
  resultId?: string;
  error?: string;
  failureCode?: string;
  failureCategory?: string;
  retryCount: number;
  adminActionBy?: string;
  adminActionAt?: string;
  lockedBy?: string;
  heartbeatAt?: string;
  queueWaitMs?: number;
  executionMs?: number;
  upstreamMs?: number;
  fileSaveMs?: number;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
};

export type AdminJobsResponse = {
  records: AdminJobRecord[];
  nextCursor?: string;
};

export type AdminJobFilters = {
  status: string;
  userId: string;
  provider: string;
  model: string;
  dateFrom: string;
  dateTo: string;
  q: string;
};

export type AdminImageFilters = {
  userId: string;
  provider: string;
  model: string;
  dateFrom: string;
  dateTo: string;
  q: string;
};

export type AdminAuditLogRecord = {
  id: string;
  adminUserId: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata: Record<string, string | number | boolean | null | undefined>;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: string;
};

export type AdminAuditLogsResponse = {
  records: AdminAuditLogRecord[];
  nextCursor?: string;
};

export function loadAdminOverview() {
  return fetchJson<AdminOverview>("/api/admin/overview", {
    cache: "no-store",
    fallbackMessage: "管理概览加载失败。"
  });
}

export function loadAdminProviders() {
  return fetchJson<AdminProvidersResponse>("/api/admin/providers", {
    cache: "no-store",
    fallbackMessage: "供应商列表加载失败。"
  });
}

export function saveAdminProvider(input: AdminProviderSaveInput) {
  const endpoint = input.providerId
    ? `/api/admin/providers/${encodeURIComponent(input.providerId)}`
    : "/api/admin/providers";

  return fetchJson<{ provider: AdminProviderSetting }>(endpoint, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
    fallbackMessage: "供应商配置保存失败。"
  });
}

export function createAdminProvider(input: AdminProviderSaveInput) {
  return fetchJson<{ provider: AdminProviderSetting }>("/api/admin/providers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
    fallbackMessage: "供应商创建失败。"
  });
}

export function testAdminProvider(providerId: string) {
  return fetchJson<{ ok: boolean; message: string }>(`/api/admin/providers/${encodeURIComponent(providerId)}/test`, {
    method: "POST",
    fallbackMessage: "供应商测试失败。"
  });
}

export function loadAdminUsage(range: "7d" | "30d", userId = "") {
  const params = new URLSearchParams({ range });
  if (userId) params.set("userId", userId);

  return fetchJson<AdminUsageResponse>(`/api/admin/usage?${params}`, {
    cache: "no-store",
    fallbackMessage: "用量统计加载失败。"
  });
}

export function loadAdminMonitor() {
  return fetchJson<AdminMonitorResponse>("/api/admin/monitor", {
    cache: "no-store",
    fallbackMessage: "平台监控加载失败。"
  });
}

export function loadAdminJobs(input: {
  filters: AdminJobFilters;
  cursor?: string;
}) {
  const params = new URLSearchParams({ limit: "30" });
  if (input.cursor) params.set("cursor", input.cursor);
  for (const [key, value] of Object.entries(input.filters)) {
    if (value.trim()) params.set(key, value.trim());
  }

  return fetchJson<AdminJobsResponse>(`/api/admin/jobs?${params}`, {
    cache: "no-store",
    fallbackMessage: "任务列表加载失败。"
  });
}

export function runAdminJobAction(action: "pause" | "resume" | "kill" | "retry", jobIds: string[]) {
  return fetchJson<{ ok: boolean; count: number; scheduledJobIds?: string[] }>(`/api/admin/jobs/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jobIds }),
    fallbackMessage: "任务操作失败。"
  });
}

export function loadAdminImages(input: {
  filters: AdminImageFilters;
  cursor?: string;
}) {
  const params = new URLSearchParams({ limit: "30" });
  if (input.cursor) params.set("cursor", input.cursor);
  for (const [key, value] of Object.entries(input.filters)) {
    if (value.trim()) params.set(key, value.trim());
  }

  return fetchJson<AdminImagesResponse>(`/api/admin/images?${params}`, {
    cache: "no-store",
    fallbackMessage: "图片审查列表加载失败。"
  });
}

export function loadAdminAuditLogs(input: { cursor?: string } = {}) {
  const params = new URLSearchParams({ limit: "30" });
  if (input.cursor) params.set("cursor", input.cursor);

  return fetchJson<AdminAuditLogsResponse>(`/api/admin/audit-logs?${params}`, {
    cache: "no-store",
    fallbackMessage: "审计日志加载失败。"
  });
}

export function saveAdminSettings(settings: AdminSettingsSaveInput) {
  return fetchJson<{ settings: AdminOverview["settings"] }>("/api/admin/settings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(settings),
    fallbackMessage: "平台设置保存失败。"
  });
}

export function savePlatformProvider(input: {
  key: string;
  baseUrl: string;
  model: string;
}) {
  return fetchJson<{ ok: boolean }>("/api/admin/provider", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      keys: { openai: input.key },
      baseUrls: { openai: input.baseUrl },
      models: { openai: input.model }
    }),
    fallbackMessage: "平台供应商配置保存失败。"
  });
}

export function createAdminUser(input: {
  email: string;
  password: string;
  role: "ADMIN" | "USER";
}) {
  return fetchJson<{ user: PublicUser }>("/api/admin/users", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
    fallbackMessage: "用户创建失败。"
  });
}

export function updateAdminUser(userId: string, input: {
  disabled?: boolean;
  role?: "ADMIN" | "USER";
  password?: string;
}) {
  return fetchJson<{ user: PublicUser }>(`/api/admin/users/${userId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
    fallbackMessage: "用户更新失败。"
  });
}

export function deleteAdminUser(userId: string) {
  return fetchJson<{ ok: boolean }>(`/api/admin/users/${userId}`, {
    method: "DELETE",
    fallbackMessage: "用户删除失败。"
  });
}
