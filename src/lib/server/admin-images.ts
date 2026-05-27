import path from "node:path";
import type { ImageRecord as DbImageRecord, User } from "@prisma/client";
import {
  decodeAdminImageCursor,
  encodeAdminImageCursor,
  normalizeAdminImageFilters,
  normalizeAdminImageLimit,
  type AdminImageFilters
} from "../admin-images";
import { prisma } from "./db";

type AdminImageRecordWithUser = DbImageRecord & {
  user: Pick<User, "email">;
};

export type AdminImageListRecord = {
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
  records: AdminImageListRecord[];
  nextCursor?: string;
};

function parseStringList(value: string | null | undefined) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function toAdminImageRecord(record: AdminImageRecordWithUser): AdminImageListRecord {
  return {
    id: record.id,
    userId: record.userId,
    userEmail: record.user.email,
    createdAt: record.createdAt.toISOString(),
    provider: record.provider,
    model: record.model,
    mode: record.mode,
    prompt: record.prompt,
    imageUrl: `/api/admin/images/file/${record.id}`,
    thumbnailUrl: `/api/admin/images/thumb/${record.id}`,
    imagePath: path.basename(record.filePath),
    size: record.size ?? undefined,
    aspectRatio: record.aspectRatio ?? undefined,
    quality: record.quality ?? undefined,
    inputFidelity: record.inputFidelity ?? undefined,
    batchId: record.batchId ?? undefined,
    projectId: record.projectId ?? undefined,
    tags: parseStringList(record.tags)
  };
}

export async function readAdminImagesPage(filters: AdminImageFilters): Promise<AdminImagesResponse> {
  const cursor = filters.cursor ? decodeAdminImageCursor(filters.cursor) : null;
  const andFilters: Array<Record<string, unknown>> = [];

  if (filters.q) {
    andFilters.push({
      OR: [
        { prompt: { contains: filters.q } },
        { model: { contains: filters.q } },
        { user: { email: { contains: filters.q } } }
      ]
    });
  }

  if (cursor) {
    andFilters.push({
      OR: [
        { createdAt: { lt: cursor.createdAt } },
        {
          createdAt: cursor.createdAt,
          id: { lt: cursor.id }
        }
      ]
    });
  }

  const records = await prisma.imageRecord.findMany({
    where: {
      ...(filters.userId ? { userId: filters.userId } : {}),
      ...(filters.provider ? { provider: filters.provider } : {}),
      ...(filters.model ? { model: filters.model } : {}),
      ...(filters.dateFrom || filters.dateTo
        ? {
            createdAt: {
              ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
              ...(filters.dateTo ? { lt: filters.dateTo } : {})
            }
          }
        : {}),
      ...(andFilters.length > 0 ? { AND: andFilters } : {})
    },
    orderBy: [
      { createdAt: "desc" },
      { id: "desc" }
    ],
    take: filters.limit + 1,
    include: {
      user: {
        select: {
          email: true
        }
      }
    }
  });
  const pageRecords = records.slice(0, filters.limit);

  return {
    records: pageRecords.map(toAdminImageRecord),
    nextCursor: records.length > filters.limit && pageRecords.length > 0
      ? encodeAdminImageCursor(pageRecords[pageRecords.length - 1])
      : undefined
  };
}

export {
  decodeAdminImageCursor,
  encodeAdminImageCursor,
  normalizeAdminImageFilters,
  normalizeAdminImageLimit
};
