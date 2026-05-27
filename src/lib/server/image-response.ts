import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { assertStorageFilePath, type StoredFileMeta } from "./files";

const PRIVATE_IMAGE_CACHE_CONTROL = "private, max-age=86400, immutable";

function getImageEtag(image: StoredFileMeta, size: number, mtimeMs: number) {
  const version = `${image.id}:${size}:${Math.trunc(mtimeMs)}`;
  return `"${Buffer.from(version).toString("base64url")}"`;
}

function hasMatchingEtag(request: Request, etag: string) {
  const value = request.headers.get("if-none-match");
  if (!value) return false;

  return value
    .split(",")
    .map((item) => item.trim())
    .some((item) => item === etag || item === "*");
}

function hasFreshModifiedSince(request: Request, mtimeMs: number) {
  const value = request.headers.get("if-modified-since");
  if (!value) return false;

  const since = Date.parse(value);
  if (Number.isNaN(since)) return false;

  return Math.trunc(mtimeMs / 1000) <= Math.trunc(since / 1000);
}

export async function createImageResponseContext(image: StoredFileMeta) {
  const safeFilePath = assertStorageFilePath(image.filePath);
  const fileStats = await stat(safeFilePath);
  const etag = getImageEtag(image, fileStats.size, fileStats.mtimeMs);
  const headers = {
    "content-type": image.mimeType,
    "content-length": String(fileStats.size),
    "cache-control": PRIVATE_IMAGE_CACHE_CONTROL,
    "last-modified": fileStats.mtime.toUTCString(),
    etag
  };

  return { image: { ...image, filePath: safeFilePath }, headers, fileStats };
}

export function isFreshImageRequest(request: Request, context: Awaited<ReturnType<typeof createImageResponseContext>>) {
  return hasMatchingEtag(request, context.headers.etag)
    || hasFreshModifiedSince(request, context.fileStats.mtimeMs);
}

export function createNotModifiedImageResponse(headers: Record<string, string>) {
  return new NextResponse(null, {
    status: 304,
    headers: {
      "cache-control": headers["cache-control"],
      "last-modified": headers["last-modified"],
      etag: headers.etag
    }
  });
}

export function createStreamedImageResponse(context: Awaited<ReturnType<typeof createImageResponseContext>>) {
  const stream = Readable.toWeb(createReadStream(context.image.filePath));
  return new NextResponse(stream as BodyInit, { headers: context.headers });
}
