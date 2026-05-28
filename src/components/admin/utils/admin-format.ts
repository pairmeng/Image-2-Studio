export function formatAdminDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function formatAdminDay(value: string) {
  return value.slice(5);
}

export function formatAdminNumber(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "0";
  return new Intl.NumberFormat("zh-CN").format(value);
}

export function formatAdminMilliseconds(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  if (value < 1000) return `${Math.round(value)} 毫秒`;

  const seconds = Math.round(value / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes > 0 ? `${minutes} 分 ${remainder} 秒` : `${seconds} 秒`;
}

export function formatAdminPercent(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `${Math.round(value)}%`;
}

export function getStatusTone(status: string) {
  if (status === "healthy" || status === "succeeded" || status === "enabled" || status === "configured" || status === "completed") return "good";
  if (status === "degraded" || status === "pending" || status === "running" || status === "idle" || status === "queued" || status === "active" || status === "missing" || status === "paused") return "warn";
  if (status === "failing" || status === "failed" || status === "disabled") return "bad";
  return "neutral";
}

const statusLabels: Record<string, string> = {
  active: "执行中",
  completed: "已完成",
  configured: "已配置",
  degraded: "波动",
  disabled: "已禁用",
  enabled: "已启用",
  failed: "失败",
  failing: "异常",
  healthy: "正常",
  idle: "空闲",
  missing: "未配置",
  paused: "已暂停",
  pending: "等待中",
  queued: "排队中",
  running: "运行中",
  succeeded: "成功"
};

export function formatAdminStatusLabel(status: string) {
  return statusLabels[status] ?? status;
}

export function formatAdminRole(role: string) {
  if (role === "ADMIN") return "管理员";
  if (role === "USER") return "普通用户";
  return role;
}

export function formatAdminQueueBackend(backend: string | undefined, enabled: boolean) {
  const value = backend ?? (enabled ? "redis" : "inline");
  if (value === "redis") return "Redis 队列";
  if (value === "inline") return "本机队列";
  return value;
}

export function formatAdminQueueMode(mode: string | undefined) {
  if (mode === "redis") return "Redis 队列";
  if (mode === "inline") return "本机调度";
  return mode ?? "-";
}

export function formatAdminProviderAdapter(adapterId: string | undefined) {
  if (adapterId === "openai") return "OpenAI 官方";
  if (adapterId === "openai-compatible") return "OpenAI 兼容";
  if (adapterId === "mock") return "Mock 测试";
  return adapterId ?? "-";
}

export function formatAdminConfigSource(source: string | undefined) {
  if (source === "database") return "数据库";
  if (source === "env") return "环境变量";
  if (source === "default") return "默认值";
  if (source === "mixed") return "混合来源";
  return source ?? "-";
}
