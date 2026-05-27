export type ImageJobFailureCategory =
  | "provider_rate_limit"
  | "provider_error"
  | "timeout"
  | "file_save_failed"
  | "config_missing"
  | "invalid_request"
  | "admin_action"
  | "unknown";

export type ImageJobFailureClassification = {
  code: string;
  category: ImageJobFailureCategory;
  label: string;
};

const FAILURE_LABELS: Record<ImageJobFailureCategory, string> = {
  provider_rate_limit: "供应商限流",
  provider_error: "供应商错误",
  timeout: "请求超时",
  file_save_failed: "文件保存失败",
  config_missing: "配置缺失",
  invalid_request: "请求参数错误",
  admin_action: "管理员操作",
  unknown: "未知错误"
};

function normalizeFailureText(value: unknown) {
  if (value instanceof Error) return value.message.toLowerCase();
  return String(value ?? "").toLowerCase();
}

export function getImageJobFailureLabel(category: string | null | undefined) {
  return FAILURE_LABELS[(category ?? "") as ImageJobFailureCategory] ?? FAILURE_LABELS.unknown;
}

export function classifyImageJobFailure(
  error: unknown,
  context: { status?: number; kind?: string; cause?: unknown } = {}
): ImageJobFailureClassification {
  const text = [
    normalizeFailureText(error),
    normalizeFailureText(context.kind),
    normalizeFailureText(context.cause),
    context.status ? String(context.status) : ""
  ].join(" ");

  let category: ImageJobFailureCategory = "unknown";
  let code = "unknown_error";

  if (/force killed|admin|管理员|终止|暂停/.test(text)) {
    category = "admin_action";
    code = "admin_action";
  } else if (/api key|apikey|unauthorized|auth|401|permission|forbidden|invalid key|no api key|missing key|configured/.test(text)) {
    category = "config_missing";
    code = "config_missing";
  } else if (/quota|rate limit|429|billing|credit|insufficient|too many requests/.test(text)) {
    category = "provider_rate_limit";
    code = "provider_rate_limit";
  } else if (/timeout|timed out|time-out|gateway timeout|gateway time-out|504|524|read timeout/.test(text)) {
    category = "timeout";
    code = "provider_timeout";
  } else if (/save|file|thumbnail|sharp|enoent|eacces|eperm|storage|stored image|generated image/.test(text)) {
    category = "file_save_failed";
    code = "file_save_failed";
  } else if (/prompt|parameter|param|invalid|unsupported|size|resolution|reference|image-to-image|400|422/.test(text)) {
    category = "invalid_request";
    code = "invalid_request";
  } else if (/provider|upstream|service unavailable|openai|nginx|openresty|502|503|500|network|fetch failed|econn|socket|dns|connection|connect/.test(text)) {
    category = "provider_error";
    code = "provider_error";
  }

  return {
    code,
    category,
    label: FAILURE_LABELS[category]
  };
}
