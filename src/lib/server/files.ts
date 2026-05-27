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
const MAX_IMAGE_PIXELS = 40_000_000;
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

function isInsideDirectory(baseDir: string, filePath: string) {
  const relative = path.relative(path.resolve(baseDir), path.resolve(filePath));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function assertStorageFilePath(filePath: string, kinds: ImageKind[] = ["generated", "upload"]) {
  const resolved = path.resolve(filePath);
  const allowed = kinds.map((kind) => kind === "generated" ? STORAGE_GENERATED_DIR : STORAGE_UPLOADS_DIR);
  if (!allowed.some((dir) => isInsideDirectory(dir, resolved))) {
    throw new AppError("Image path is outside storage.", 403);
  }

  return resolved;
}

function detectImageMimeType(buffer: Buffer) {
  if (
    buffer.length >= 8
    && buffer[0] === 0x89
    && buffer[1] === 0x50
    && buffer[2] === 0x4e
    && buffer[3] === 0x47
    && buffer[4] === 0x0d
    && buffer[5] === 0x0a
    && buffer[6] === 0x1a
    && buffer[7] === 0x0a
  ) {
    return "image/png";
  }

  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }

  if (
    buffer.length >= 12
    && buffer.subarray(0, 4).toString("ascii") === "RIFF"
    && buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }

  return "";
}

export async function validateUploadedImageBuffer(buffer: Buffer, declaredMimeType: string) {
  if (buffer.length === 0) {
    throw new AppError("Reference image cannot be empty.");
  }

  const detectedMimeType = detectImageMimeType(buffer);
  if (!ALLOWED_UPLOAD_TYPES.has(detectedMimeType) || detectedMimeType !== declaredMimeType) {
    throw new AppError("Reference image content does not match a supported PNG, JPEG, or WebP file.");
  }

  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(buffer, { failOn: "error" }).metadata();
  } catch {
    throw new AppError("Reference image could not be decoded.");
  }

  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  const pixels = width * height;
  if (width <= 0 || height <= 0 || pixels <= 0) {
    throw new AppError("Reference image dimensions are invalid.");
  }
  if (pixels > MAX_IMAGE_PIXELS) {
    throw new AppError("Reference image dimensions are too large.");
  }

  return detectedMimeType;
}

async function ensureUserStorageDir(userId: string, kind: ImageKind) {
  const baseDir = kind === "generated" ? STORAGE_GENERATED_DIR : STORAGE_UPLOADS_DIR;
  const dir = path.join(baseDir, userId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function createImageThumbnail(filePath: string, userId: string, kind: ImageKind) {
  const dir = await ensureUserStorageDir(userId, kind);
  const thumbnailPath = path.join(dir, `${randomUUID()}.thumb.webp`);
  const sourcePath = assertStorageFilePath(filePath, [kind]);

  try {
    await sharp(sourcePath, { failOn: "none" })
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
  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = await validateUploadedImageBuffer(buffer, file.type);
  return createStoredImage(userId, "upload", buffer, mimeType);
}

export async function readStoredImageForUser(userId: string, imageId: string) {
  const image = await readStoredImageMetaForUser(userId, imageId);
  const buffer = await fs.readFile(assertStorageFilePath(image.filePath));

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
        userId,
        deletedAt: null
      }
    });

    if (!historyRecord) {
      throw new AppError("Image not found.", 404);
    }

    return {
      id: historyRecord.id,
      filename: path.basename(historyRecord.filePath),
      filePath: assertStorageFilePath(historyRecord.filePath, ["generated"]),
      imageUrl: `/api/images/file/${historyRecord.id}`,
      thumbnailPath: historyRecord.thumbnailPath ? assertStorageFilePath(historyRecord.thumbnailPath, ["generated"]) : undefined,
      thumbnailUrl: historyRecord.thumbnailPath ? `/api/images/thumb/${historyRecord.id}` : undefined,
      thumbnailMimeType: historyRecord.thumbnailMimeType ?? undefined,
      mimeType: historyRecord.mimeType || extensionToMime(historyRecord.filePath)
    };
  }

  return {
    id: record.id,
    filename: record.filename,
    filePath: assertStorageFilePath(record.filePath, [record.kind === "upload" ? "upload" : "generated"]),
    imageUrl: `/api/images/file/${record.id}`,
    mimeType: record.mimeType || extensionToMime(record.filePath)
  };
}

export async function readThumbnailMetaForUser(userId: string, imageId: string): Promise<StoredFileMeta> {
  const record = await prisma.imageRecord.findFirst({
    where: {
      id: imageId,
      userId,
      deletedAt: null
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
      filePath: assertStorageFilePath(record.filePath, ["generated"]),
      imageUrl: `/api/images/file/${record.id}`,
      thumbnailUrl: undefined,
      mimeType: record.mimeType || extensionToMime(record.filePath)
    };
  }

  return {
    id: record.id,
    filename: path.basename(thumbnailPath),
    filePath: assertStorageFilePath(thumbnailPath, ["generated"]),
    imageUrl: `/api/images/file/${record.id}`,
    thumbnailPath,
    thumbnailUrl: `/api/images/thumb/${record.id}`,
    thumbnailMimeType,
    mimeType: thumbnailMimeType
  };
}

export async function readImageRecordFileMetaForAdmin(recordId: string): Promise<StoredFileMeta> {
  const record = await prisma.imageRecord.findUnique({
    where: {
      id: recordId
    }
  });

  if (!record) {
    throw new AppError("Image not found.", 404);
  }

  return {
    id: record.id,
    filename: path.basename(record.filePath),
    filePath: assertStorageFilePath(record.filePath, ["generated"]),
    imageUrl: `/api/admin/images/file/${record.id}`,
    thumbnailPath: record.thumbnailPath ? assertStorageFilePath(record.thumbnailPath, ["generated"]) : undefined,
    thumbnailUrl: record.thumbnailPath ? `/api/admin/images/thumb/${record.id}` : undefined,
    thumbnailMimeType: record.thumbnailMimeType ?? undefined,
    mimeType: record.mimeType || extensionToMime(record.filePath)
  };
}

export async function readImageRecordThumbnailMetaForAdmin(recordId: string): Promise<StoredFileMeta> {
  const record = await prisma.imageRecord.findUnique({
    where: {
      id: recordId
    }
  });

  if (!record) {
    throw new AppError("Image not found.", 404);
  }

  let thumbnailPath = record.thumbnailPath;
  let thumbnailMimeType = record.thumbnailMimeType || THUMBNAIL_MIME_TYPE;

  if (!thumbnailPath) {
    const thumbnail = await createImageThumbnail(record.filePath, record.userId, "generated");
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
      filePath: assertStorageFilePath(record.filePath, ["generated"]),
      imageUrl: `/api/admin/images/file/${record.id}`,
      thumbnailUrl: undefined,
      mimeType: record.mimeType || extensionToMime(record.filePath)
    };
  }

  return {
    id: record.id,
    filename: path.basename(thumbnailPath),
    filePath: assertStorageFilePath(thumbnailPath, ["generated"]),
    imageUrl: `/api/admin/images/file/${record.id}`,
    thumbnailPath,
    thumbnailUrl: `/api/admin/images/thumb/${record.id}`,
    thumbnailMimeType,
    mimeType: thumbnailMimeType
  };
}
