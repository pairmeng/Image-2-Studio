import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { AppError } from "./errors";
import { STORAGE_GENERATED_DIR, STORAGE_UPLOADS_DIR } from "./paths";
import { prisma } from "./db";

export type StoredFile = {
  id: string;
  filename: string;
  filePath: string;
  imageUrl: string;
  mimeType: string;
  thumbnailPath?: string;
  thumbnailUrl?: string;
  thumbnailMimeType?: string;
  buffer: Buffer;
};

export type StoredFileMeta = Omit<StoredFile, "buffer">;

const ALLOWED_UPLOAD_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const THUMBNAIL_MAX_WIDTH = 640;
const THUMBNAIL_MAX_HEIGHT = 640;
const THUMBNAIL_MIME_TYPE = "image/webp";

export function assertAllowedImageFile(file: File) {
  if (!ALLOWED_UPLOAD_TYPES.has(file.type)) {
    throw new AppError("Only PNG, JPEG, and WebP images are supported.");
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    throw new AppError("Each reference image must be 10MB or smaller.");
  }
}

export function mimeToExtension(mimeType: string) {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  return "png";
}

export function extensionToMime(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  return "image/png";
}

type ImageKind = "generated" | "upload";

async function ensureUserStorageDir(userId: string, kind: ImageKind) {
  const baseDir = kind === "generated" ? STORAGE_GENERATED_DIR : STORAGE_UPLOADS_DIR;
  const dir = path.join(baseDir, userId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function createImageThumbnail(filePath: string, userId: string, kind: ImageKind) {
  const dir = await ensureUserStorageDir(userId, kind);
  const thumbnailPath = path.join(dir, `${randomUUID()}.thumb.webp`);

  try {
    await sharp(filePath, { failOn: "none" })
      .rotate()
      .resize({
        width: THUMBNAIL_MAX_WIDTH,
        height: THUMBNAIL_MAX_HEIGHT,
        fit: "inside",
        withoutEnlargement: true
      })
      .webp({ quality: 72, effort: 4 })
      .toFile(thumbnailPath);

    return {
      thumbnailPath,
      thumbnailMimeType: THUMBNAIL_MIME_TYPE
    };
  } catch (error) {
    await fs.rm(thumbnailPath, { force: true }).catch(() => undefined);
    console.warn("[images/files] failed to create thumbnail", {
      filePath,
      message: error instanceof Error ? error.message : String(error)
    });
    return {};
  }
}

async function createStoredImage(userId: string, kind: ImageKind, buffer: Buffer, mimeType: string): Promise<StoredFile> {
  const dir = await ensureUserStorageDir(userId, kind);
  const ext = mimeToExtension(mimeType);
  const filename = `${randomUUID()}.${ext}`;
  const filePath = path.join(dir, filename);

  await fs.writeFile(filePath, buffer);
  const thumbnail = kind === "generated" ? await createImageThumbnail(filePath, userId, kind) : {};

  const record = await prisma.storedImage.create({
    data: {
      userId,
      kind,
      filename,
      filePath,
      mimeType
    }
  });

  return {
    id: record.id,
    filename,
    filePath,
    imageUrl: `/api/images/file/${record.id}`,
    thumbnailPath: thumbnail.thumbnailPath,
    thumbnailUrl: thumbnail.thumbnailPath ? `/api/images/thumb/${record.id}` : undefined,
    thumbnailMimeType: thumbnail.thumbnailMimeType,
    mimeType,
    buffer
  };
}

export async function saveGeneratedImage(userId: string, buffer: Buffer, mimeType: string): Promise<StoredFile> {
  return createStoredImage(userId, "generated", buffer, mimeType);
}

export async function saveUploadedFile(userId: string, file: File): Promise<StoredFile> {
  assertAllowedImageFile(file);
  const mimeType = file.type;
  const buffer = Buffer.from(await file.arrayBuffer());
  return createStoredImage(userId, "upload", buffer, mimeType);
}

export async function readStoredImageForUser(userId: string, imageId: string) {
  const image = await readStoredImageMetaForUser(userId, imageId);
  const buffer = await fs.readFile(image.filePath);

  return {
    ...image,
    buffer
  };
}

export async function readStoredImageMetaForUser(userId: string, imageId: string): Promise<StoredFileMeta> {
  const record = await prisma.storedImage.findFirst({
    where: {
      id: imageId,
      userId
    }
  });

  if (!record) {
    const historyRecord = await prisma.imageRecord.findFirst({
      where: {
        id: imageId,
        userId
      }
    });

    if (!historyRecord) {
      throw new AppError("Image not found.", 404);
    }

    return {
      id: historyRecord.id,
      filename: path.basename(historyRecord.filePath),
      filePath: historyRecord.filePath,
      imageUrl: `/api/images/file/${historyRecord.id}`,
      thumbnailPath: historyRecord.thumbnailPath ?? undefined,
      thumbnailUrl: historyRecord.thumbnailPath ? `/api/images/thumb/${historyRecord.id}` : undefined,
      thumbnailMimeType: historyRecord.thumbnailMimeType ?? undefined,
      mimeType: historyRecord.mimeType || extensionToMime(historyRecord.filePath)
    };
  }

  return {
    id: record.id,
    filename: record.filename,
    filePath: record.filePath,
    imageUrl: `/api/images/file/${record.id}`,
    mimeType: record.mimeType || extensionToMime(record.filePath)
  };
}

export async function readThumbnailMetaForUser(userId: string, imageId: string): Promise<StoredFileMeta> {
  const record = await prisma.imageRecord.findFirst({
    where: {
      id: imageId,
      userId
    }
  });

  if (!record) {
    return readStoredImageMetaForUser(userId, imageId);
  }

  let thumbnailPath = record.thumbnailPath;
  let thumbnailMimeType = record.thumbnailMimeType || THUMBNAIL_MIME_TYPE;

  if (!thumbnailPath) {
    const thumbnail = await createImageThumbnail(record.filePath, userId, "generated");
    if (thumbnail.thumbnailPath) {
      thumbnailPath = thumbnail.thumbnailPath;
      thumbnailMimeType = thumbnail.thumbnailMimeType || THUMBNAIL_MIME_TYPE;
      await prisma.imageRecord.update({
        where: { id: record.id },
        data: {
          thumbnailPath,
          thumbnailMimeType
        }
      });
    }
  }

  if (!thumbnailPath) {
    return {
      id: record.id,
      filename: path.basename(record.filePath),
      filePath: record.filePath,
      imageUrl: `/api/images/file/${record.id}`,
      thumbnailUrl: undefined,
      mimeType: record.mimeType || extensionToMime(record.filePath)
    };
  }

  return {
    id: record.id,
    filename: path.basename(thumbnailPath),
    filePath: thumbnailPath,
    imageUrl: `/api/images/file/${record.id}`,
    thumbnailPath,
    thumbnailUrl: `/api/images/thumb/${record.id}`,
    thumbnailMimeType,
    mimeType: thumbnailMimeType
  };
}
