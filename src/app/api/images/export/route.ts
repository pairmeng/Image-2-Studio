import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import { AppError } from "@/lib/server/errors";
import { assertStorageFilePath } from "@/lib/server/files";
import { handleRouteError, readJsonBody } from "@/lib/server/responses";

export const runtime = "nodejs";

const MAX_EXPORT_IMAGES = 60;
const MAX_EXPORT_BYTES = 300 * 1024 * 1024;
const CRC_TABLE = new Uint32Array(256).map((_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function normalizeIds(value: unknown) {
  if (!Array.isArray(value)) return [];

  return Array.from(new Set(value
    .map((item) => typeof item === "string" ? item.trim() : "")
    .filter(Boolean)))
    .slice(0, MAX_EXPORT_IMAGES);
}

function sanitizeFilename(value: string) {
  const cleaned = value
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  return (cleaned || "image").slice(0, 80);
}

function getExtension(mimeType: string, filePath: string) {
  const ext = path.extname(filePath).replace(".", "").toLowerCase();
  if (ext) return ext;
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  return "png";
}

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date: Date) {
  const year = Math.max(1980, date.getFullYear());
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();

  return { dosTime, dosDate };
}

function uint16(value: number) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value, 0);
  return buffer;
}

function uint32(value: number) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value >>> 0, 0);
  return buffer;
}

function createZip(files: Array<{ name: string; data: Buffer; date: Date }>) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBuffer = Buffer.from(file.name, "utf8");
    const checksum = crc32(file.data);
    const { dosTime, dosDate } = dosDateTime(file.date);
    const localHeader = Buffer.concat([
      uint32(0x04034b50),
      uint16(20),
      uint16(0x0800),
      uint16(0),
      uint16(dosTime),
      uint16(dosDate),
      uint32(checksum),
      uint32(file.data.length),
      uint32(file.data.length),
      uint16(nameBuffer.length),
      uint16(0),
      nameBuffer
    ]);

    localParts.push(localHeader, file.data);

    centralParts.push(Buffer.concat([
      uint32(0x02014b50),
      uint16(20),
      uint16(20),
      uint16(0x0800),
      uint16(0),
      uint16(dosTime),
      uint16(dosDate),
      uint32(checksum),
      uint32(file.data.length),
      uint32(file.data.length),
      uint16(nameBuffer.length),
      uint16(0),
      uint16(0),
      uint16(0),
      uint16(0),
      uint32(0),
      uint32(offset),
      nameBuffer
    ]));

    offset += localHeader.length + file.data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.concat([
    uint32(0x06054b50),
    uint16(0),
    uint16(0),
    uint16(files.length),
    uint16(files.length),
    uint32(centralDirectory.length),
    uint32(offset),
    uint16(0)
  ]);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await readJsonBody<{ ids?: unknown; naming?: unknown }>(request);
    const ids = normalizeIds(body.ids);

    if (ids.length === 0) {
      return NextResponse.json({ error: "Choose images to export." }, { status: 400 });
    }

    const records = await prisma.imageRecord.findMany({
      where: {
        userId: user.id,
        id: { in: ids },
        deletedAt: null
      },
      orderBy: [
        { createdAt: "asc" },
        { id: "asc" }
      ]
    });

    const order = new Map(ids.map((id, index) => [id, index]));
    records.sort((left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0));

    let totalBytes = 0;
    const files = [];
    for (const [index, record] of records.entries()) {
      const safeFilePath = assertStorageFilePath(record.filePath, ["generated"]);
      const data = await fs.readFile(safeFilePath);
      totalBytes += data.length;
      if (totalBytes > MAX_EXPORT_BYTES) {
        throw new AppError("Export is too large.", 413);
      }
      const ext = getExtension(record.mimeType, record.filePath);
      const promptPart = sanitizeFilename(record.prompt).slice(0, 44);
      const name = `${String(index + 1).padStart(2, "0")}-${promptPart || record.id}.${ext}`;

      files.push({
        name,
        data,
        date: record.createdAt
      });
    }

    const zip = createZip(files);

    return new NextResponse(zip, {
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="image-2-export-${Date.now()}.zip"`,
        "cache-control": "no-store"
      }
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
