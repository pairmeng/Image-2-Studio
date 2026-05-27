import type { ImageRecord as DbImageRecord } from "@prisma/client";
import { AppError } from "./server/errors";

const DEFAULT_ADMIN_IMAGE_LIMIT = 30;
const MAX_ADMIN_IMAGE_LIMIT = 60;

export type AdminImageCursor = {
  createdAt: Date;
  id: string;
};

export type AdminImageFilters = {
  limit: number;
  cursor: string | null;
  userId: string | null;
  provider: string | null;
  model: string | null;
  dateFrom: Date | null;
  dateTo: Date | null;
  q: string | null;
};

export function encodeAdminImageCursor(record: Pick<DbImageRecord, "createdAt" | "id">) {
  return Buffer.from(JSON.stringify({
    createdAt: record.createdAt.toISOString(),
    id: record.id
  })).toString("base64url");
}

export function decodeAdminImageCursor(cursor: string): AdminImageCursor {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
      createdAt?: unknown;
      id?: unknown;
    };

    if (typeof parsed.createdAt !== "string" || typeof parsed.id !== "string") {
      throw new Error("Invalid cursor.");
    }

    const createdAt = new Date(parsed.createdAt);
    if (Number.isNaN(createdAt.getTime())) {
      throw new Error("Invalid cursor.");
    }

    return {
      createdAt,
      id: parsed.id
    };
  } catch {
    throw new AppError("Invalid admin image cursor.");
  }
}

export function normalizeAdminImageLimit(value: string | null | undefined) {
  if (!value) return DEFAULT_ADMIN_IMAGE_LIMIT;

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_ADMIN_IMAGE_LIMIT;

  return Math.min(parsed, MAX_ADMIN_IMAGE_LIMIT);
}

function normalizeOptionalText(value: string | null | undefined, maxLength: number) {
  const normalized = value?.trim();
  if (!normalized) return null;

  return normalized.slice(0, maxLength);
}

function parseDateStart(value: string | null | undefined) {
  const normalized = normalizeOptionalText(value, 32);
  if (!normalized) return null;

  const parsed = new Date(`${normalized.slice(0, 10)}T00:00:00.000+08:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseDateEndExclusive(value: string | null | undefined) {
  const start = parseDateStart(value);
  if (!start) return null;

  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}

export function normalizeAdminImageFilters(searchParams: URLSearchParams): AdminImageFilters {
  return {
    limit: normalizeAdminImageLimit(searchParams.get("limit")),
    cursor: normalizeOptionalText(searchParams.get("cursor"), 500),
    userId: normalizeOptionalText(searchParams.get("userId"), 100),
    provider: normalizeOptionalText(searchParams.get("provider"), 80),
    model: normalizeOptionalText(searchParams.get("model"), 160),
    dateFrom: parseDateStart(searchParams.get("dateFrom")),
    dateTo: parseDateEndExclusive(searchParams.get("dateTo")),
    q: normalizeOptionalText(searchParams.get("q"), 120)
  };
}
