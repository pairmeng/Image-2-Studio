import { NextResponse } from "next/server";
import { AppError } from "./errors";

export type RateLimitOptions = {
  limit: number;
  windowMs: number;
};

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

export const DEFAULT_JSON_BODY_LIMIT_BYTES = 256 * 1024;

const rateLimitBuckets = new Map<string, RateLimitBucket>();

function getHeaderValue(request: Request, name: string) {
  return request.headers.get(name)?.trim() ?? "";
}

function normalizeHost(value: string) {
  return value.trim().toLowerCase().replace(/\/+$/, "");
}

function getRequestProtocolCandidates(request: Request) {
  const requestUrl = new URL(request.url);
  const candidates = new Set([requestUrl.protocol]);
  const forwardedProto = getHeaderValue(request, "x-forwarded-proto")
    .split(",")[0]
    ?.trim()
    .toLowerCase();

  if (forwardedProto === "https" || forwardedProto === "http") {
    candidates.add(`${forwardedProto}:`);
  }

  return candidates;
}

function isSameOriginValue(request: Request, value: string) {
  if (!value) return false;

  try {
    const requestUrl = new URL(request.url);
    const checkedUrl = new URL(value);
    return getRequestProtocolCandidates(request).has(checkedUrl.protocol)
      && normalizeHost(checkedUrl.host) === normalizeHost(requestUrl.host);
  } catch {
    return false;
  }
}

export function getRequestClientIp(request: Request) {
  const forwarded = getHeaderValue(request, "x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }

  return getHeaderValue(request, "x-real-ip")
    || getHeaderValue(request, "cf-connecting-ip")
    || "unknown";
}

export function assertSameOrigin(request: Request) {
  const origin = getHeaderValue(request, "origin");
  if (origin) {
    if (!isSameOriginValue(request, origin)) {
      throw new AppError("Cross-origin requests are not allowed.", 403);
    }
    return;
  }

  const referer = getHeaderValue(request, "referer");
  if (referer && !isSameOriginValue(request, referer)) {
    throw new AppError("Cross-origin requests are not allowed.", 403);
  }
}

export function createSameOriginMiddlewareResponse(request: Request) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method.toUpperCase())) return null;

  try {
    assertSameOrigin(request);
    return null;
  } catch (error) {
    const message = error instanceof AppError ? error.message : "Cross-origin requests are not allowed.";
    const status = error instanceof AppError ? error.status : 403;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function assertRateLimit(scope: string, key: string, options: RateLimitOptions) {
  const now = Date.now();
  const bucketKey = `${scope}:${key}`;
  const current = rateLimitBuckets.get(bucketKey);

  if (!current || current.resetAt <= now) {
    rateLimitBuckets.set(bucketKey, {
      count: 1,
      resetAt: now + options.windowMs
    });
    return;
  }

  current.count += 1;
  if (current.count > options.limit) {
    throw new AppError("Too many requests. Please try again later.", 429);
  }
}

export function resetRateLimitsForTests() {
  rateLimitBuckets.clear();
}

export async function readLimitedTextBody(request: Request, maxBytes = DEFAULT_JSON_BODY_LIMIT_BYTES) {
  const contentLength = Number.parseInt(request.headers.get("content-length") ?? "", 10);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new AppError("Request body is too large.", 413);
  }

  const text = await request.text().catch(() => "");
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new AppError("Request body is too large.", 413);
  }

  return text;
}

export async function readLimitedJsonBody<T = Record<string, unknown>>(
  request: Request,
  maxBytes = DEFAULT_JSON_BODY_LIMIT_BYTES
): Promise<T> {
  const text = await readLimitedTextBody(request, maxBytes);
  if (!text.trim()) return {} as T;

  try {
    const body = JSON.parse(text) as unknown;
    return body && typeof body === "object" && !Array.isArray(body)
      ? body as T
      : {} as T;
  } catch {
    return {} as T;
  }
}

export async function assertAuthRateLimit(request: Request, scope: "login" | "register" | "password", keyParts: string[]) {
  const ip = getRequestClientIp(request);
  const key = [ip, ...keyParts.map((part) => part.trim().toLowerCase()).filter(Boolean)].join(":");
  const options = scope === "password"
    ? { limit: 8, windowMs: 15 * 60 * 1000 }
    : { limit: 10, windowMs: 15 * 60 * 1000 };

  await assertRateLimit(`auth:${scope}`, key, options);
}
