import type { ImageRecord as DbImageRecord } from "@prisma/client";
import type { ImageMode, ProviderId } from "../models";
import type { ImageRecord } from "../types";
import { prisma } from "./db";

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
    provider: record.provider as ProviderId,
    model: record.model,
    mode: toUiMode(record.mode),
    prompt: record.prompt,
    imageUrl: `/api/images/file/${record.id}`,
    imagePath: record.filePath,
    size: record.size ?? undefined,
    aspectRatio: record.aspectRatio ?? undefined,
    quality: record.quality ?? undefined,
    inputFidelity: record.inputFidelity ?? undefined,
    sourceImageIds: parseStringList(record.sourceImageIds),
    uploadUrls: parseStringList(record.uploadImageIds).map((id) => `/api/images/file/${id}`),
    parentId: record.parentId ?? undefined,
    providerMeta: parseMeta(record.providerMeta)
  };
}

export async function readHistory(userId: string): Promise<ImageRecord[]> {
  const records = await prisma.imageRecord.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" }
  });

  return records.map(toImageRecord);
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
  size?: string;
  aspectRatio?: string;
  quality?: string;
  inputFidelity?: string;
  sourceImageIds: string[];
  uploadImageIds: string[];
  parentId?: string;
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
      size: input.size,
      aspectRatio: input.aspectRatio,
      quality: input.quality,
      inputFidelity: input.inputFidelity,
      sourceImageIds: JSON.stringify(input.sourceImageIds),
      uploadImageIds: JSON.stringify(input.uploadImageIds),
      parentId: input.parentId,
      providerMeta: input.providerMeta ? JSON.stringify(input.providerMeta) : undefined
    }
  });

  return toImageRecord(record);
}

export async function clearHistory(userId: string) {
  await prisma.imageRecord.deleteMany({ where: { userId } });
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
