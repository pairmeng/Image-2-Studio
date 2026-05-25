import { promises as fs } from "node:fs";
import path from "node:path";
import type { ImageRecord as DbImageRecord } from "@prisma/client";
import type { ImageMode, ProviderId } from "../models";
import type { HistoryResponse, ImageRecord, ImageRecordProvider } from "../types";
import { prisma } from "./db";
import { AppError } from "./errors";
import { STORAGE_GENERATED_DIR } from "./paths";

const DEFAULT_HISTORY_LIMIT = 30;
const MAX_HISTORY_LIMIT = 60;
const MAX_DELETE_IDS = 100;

function encodeHistoryCursor(record: Pick<DbImageRecord, "createdAt" | "id">) {
  return Buffer.from(JSON.stringify({
    createdAt: record.createdAt.toISOString(),
    id: record.id
  })).toString("base64url");
}

function decodeHistoryCursor(cursor: string) {
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
    throw new AppError("Invalid history cursor.");
  }
}

export function normalizeHistoryLimit(value: string | null | undefined) {
  if (!value) return DEFAULT_HISTORY_LIMIT;

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_HISTORY_LIMIT;

  return Math.min(parsed, MAX_HISTORY_LIMIT);
}

function toUiMode(mode: string): ImageMode {
  return mode === "image_to_image" ? "image-to-image" : "text-to-image";
}

export function toDbMode(mode: ImageMode) {
  return mode === "image-to-image" ? "image_to_image" : "text_to_image";
}

function parseStringList(value: string | null | undefined) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function parseMeta(value: string | null | undefined) {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

export function toImageRecord(record: DbImageRecord): ImageRecord {
  return {
    id: record.id,
    createdAt: record.createdAt.toISOString(),
    provider: record.provider as ImageRecordProvider,
    model: record.model,
    mode: toUiMode(record.mode),
    prompt: record.prompt,
    imageUrl: `/api/images/file/${record.id}`,
    thumbnailUrl: `/api/images/thumb/${record.id}`,
    imagePath: record.filePath,
    size: record.size ?? undefined,
    aspectRatio: record.aspectRatio ?? undefined,
    quality: record.quality ?? undefined,
    inputFidelity: record.inputFidelity ?? undefined,
    sourceImageIds: parseStringList(record.sourceImageIds),
  uploadUrls: parseStringList(record.uploadImageIds).map((id) => `/api/images/file/${id}`),
  parentId: record.parentId ?? undefined,
  batchId: record.batchId ?? undefined,
  batchItemId: record.batchItemId ?? undefined,
  projectId: record.projectId ?? undefined,
  tags: parseStringList(record.tags),
  providerMeta: parseMeta(record.providerMeta)
  };
}

export async function readHistory(userId: string): Promise<ImageRecord[]> {
  const records = await prisma.imageRecord.findMany({
    where: { userId },
    orderBy: [
      { createdAt: "desc" },
      { id: "desc" }
    ]
  });

  return records.map(toImageRecord);
}

export async function readHistoryPage(userId: string, input: {
  limit?: number;
  cursor?: string | null;
  batchId?: string | null;
  projectId?: string | null;
  tag?: string | null;
}): Promise<HistoryResponse> {
  const limit = Math.min(Math.max(input.limit ?? DEFAULT_HISTORY_LIMIT, 1), MAX_HISTORY_LIMIT);
  const cursor = input.cursor ? decodeHistoryCursor(input.cursor) : null;
  const batchId = input.batchId?.trim();
  const projectId = input.projectId?.trim();
  const tag = input.tag?.trim();
  const records = await prisma.imageRecord.findMany({
    where: {
      userId,
      ...(batchId ? { batchId } : {}),
      ...(projectId ? { projectId } : {}),
      ...(tag ? { tags: { contains: `"${tag}"` } } : {}),
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: cursor.createdAt } },
              {
                createdAt: cursor.createdAt,
                id: { lt: cursor.id }
              }
            ]
          }
        : {})
    },
    orderBy: [
      { createdAt: "desc" },
      { id: "desc" }
    ],
    take: limit + 1
  });
  const pageRecords = records.slice(0, limit);

  return {
    records: pageRecords.map(toImageRecord),
    nextCursor: records.length > limit && pageRecords.length > 0
      ? encodeHistoryCursor(pageRecords[pageRecords.length - 1])
      : undefined
  };
}

export async function appendHistory(input: {
  id: string;
  userId: string;
  provider: ProviderId;
  model: string;
  mode: ImageMode;
  prompt: string;
  filePath: string;
  mimeType: string;
  thumbnailPath?: string;
  thumbnailMimeType?: string;
  size?: string;
  aspectRatio?: string;
  quality?: string;
  inputFidelity?: string;
  sourceImageIds: string[];
  uploadImageIds: string[];
  parentId?: string;
  batchId?: string;
  batchItemId?: string;
  projectId?: string;
  tags?: string[];
  providerMeta?: Record<string, unknown>;
}) {
  const record = await prisma.imageRecord.create({
    data: {
      id: input.id,
      userId: input.userId,
      provider: input.provider,
      model: input.model,
      mode: toDbMode(input.mode),
      prompt: input.prompt,
      filePath: input.filePath,
      mimeType: input.mimeType,
      thumbnailPath: input.thumbnailPath,
      thumbnailMimeType: input.thumbnailMimeType,
      size: input.size,
      aspectRatio: input.aspectRatio,
      quality: input.quality,
      inputFidelity: input.inputFidelity,
      sourceImageIds: JSON.stringify(input.sourceImageIds),
      uploadImageIds: JSON.stringify(input.uploadImageIds),
      parentId: input.parentId,
      batchId: input.batchId,
      batchItemId: input.batchItemId,
      projectId: input.projectId,
      tags: JSON.stringify(input.tags ?? []),
      providerMeta: input.providerMeta ? JSON.stringify(input.providerMeta) : undefined
    }
  });

  return toImageRecord(record);
}

export async function clearHistory(userId: string) {
  const records = await prisma.imageRecord.findMany({ where: { userId } });
  await prisma.imageRecord.deleteMany({ where: { userId } });
  await cleanupGeneratedHistoryFiles(userId, records);
}

export async function findRecordsByIds(userId: string, ids: string[]) {
  if (ids.length === 0) return [];

  return prisma.imageRecord.findMany({
    where: {
      userId,
      id: { in: ids }
    }
  });
}

function normalizeDeleteIds(ids: unknown) {
  if (!Array.isArray(ids)) {
    throw new AppError("Choose at least one image to delete.");
  }

  const normalized = Array.from(new Set(ids
    .map((id) => typeof id === "string" ? id.trim() : "")
    .filter(Boolean)));

  if (normalized.length === 0) {
    throw new AppError("Choose at least one image to delete.");
  }

  if (normalized.length > MAX_DELETE_IDS) {
    throw new AppError(`Delete at most ${MAX_DELETE_IDS} images at a time.`);
  }

  return normalized;
}

function isInsideDirectory(baseDir: string, filePath: string) {
  const relative = path.relative(baseDir, filePath);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function cleanupGeneratedHistoryFiles(userId: string, records: Array<Pick<DbImageRecord, "filePath" | "thumbnailPath">>) {
  const userGeneratedDir = path.resolve(STORAGE_GENERATED_DIR, userId);
  const filePaths = Array.from(new Set(records
    .flatMap((record) => [record.filePath, record.thumbnailPath])
    .filter((filePath): filePath is string => Boolean(filePath))));
  if (filePaths.length === 0) return;

  await prisma.storedImage.deleteMany({
    where: {
      userId,
      kind: "generated",
      filePath: { in: filePaths }
    }
  });

  await Promise.all(filePaths.map(async (filePath) => {
    const resolved = path.resolve(filePath);
    if (!isInsideDirectory(userGeneratedDir, resolved)) return;

    try {
      await fs.rm(resolved, { force: true });
    } catch (error) {
      console.warn("[images/history] failed to remove generated file", {
        filePath: resolved,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }));
}

export async function deleteHistoryRecords(userId: string, ids: unknown) {
  const normalizedIds = normalizeDeleteIds(ids);
  const records = await prisma.imageRecord.findMany({
    where: {
      userId,
      id: { in: normalizedIds }
    }
  });

  if (records.length === 0) {
    return [];
  }

  await prisma.imageRecord.deleteMany({
    where: {
      userId,
      id: { in: records.map((record) => record.id) }
    }
  });
  await cleanupGeneratedHistoryFiles(userId, records);

  return records.map((record) => record.id);
}
