import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { AppError } from "./errors";
import { STORAGE_GENERATED_DIR, STORAGE_UPLOADS_DIR } from "./paths";
import { prisma } from "./db";

export type StoredFile = {
  id: string;
  filename: string;
  filePath: string;
  imageUrl: string;
  mimeType: string;
  buffer: Buffer;
};

const ALLOWED_UPLOAD_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

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

async function createStoredImage(userId: string, kind: ImageKind, buffer: Buffer, mimeType: string): Promise<StoredFile> {
  const dir = await ensureUserStorageDir(userId, kind);
  const ext = mimeToExtension(mimeType);
  const filename = `${randomUUID()}.${ext}`;
  const filePath = path.join(dir, filename);

  await fs.writeFile(filePath, buffer);

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

    const buffer = await fs.readFile(historyRecord.filePath);
    return {
      id: historyRecord.id,
      filename: path.basename(historyRecord.filePath),
      filePath: historyRecord.filePath,
      imageUrl: `/api/images/file/${historyRecord.id}`,
      mimeType: historyRecord.mimeType || extensionToMime(historyRecord.filePath),
      buffer
    };
  }

  const buffer = await fs.readFile(record.filePath);
  return {
    id: record.id,
    filename: record.filename,
    filePath: record.filePath,
    imageUrl: `/api/images/file/${record.id}`,
    mimeType: record.mimeType || extensionToMime(record.filePath),
    buffer
  };
}
