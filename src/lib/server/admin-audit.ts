import { prisma } from "./db";

export type AdminAuditMetadata = Record<string, string | number | boolean | null | undefined>;

export type PublicAdminAuditLog = {
  id: string;
  adminUserId: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata: AdminAuditMetadata;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: string;
};

const sensitiveStatusSuffixes = [
  "configured",
  "updated",
  "set",
  "reset",
  "length",
  "target"
];

const sensitiveExactKeys = new Set([
  "password",
  "token",
  "secret",
  "key",
  "redisurl",
  "apikey"
]);

function normalizeMetadataKey(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isSensitiveMetadataKey(key: string) {
  const normalizedKey = normalizeMetadataKey(key);
  if (sensitiveStatusSuffixes.some((suffix) => normalizedKey.endsWith(suffix))) {
    return false;
  }

  return sensitiveExactKeys.has(normalizedKey)
    || normalizedKey.endsWith("password")
    || normalizedKey.endsWith("token")
    || normalizedKey.endsWith("secret")
    || normalizedKey.endsWith("key")
    || normalizedKey.endsWith("apikey");
}

function sanitizeMetadataValue(key: string, value: unknown): string | number | boolean | null {
  if (isSensitiveMetadataKey(key)) {
    return "[redacted]";
  }

  if (typeof value === "string") return value.slice(0, 500);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value;
  if (value === null || value === undefined) return null;

  return JSON.stringify(value).slice(0, 500);
}

export function sanitizeAdminAuditMetadata(metadata: Record<string, unknown> = {}): AdminAuditMetadata {
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [key, sanitizeMetadataValue(key, value)])
  );
}

export async function writeAdminAuditLog(input: {
  adminUserId: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  const metadata = sanitizeAdminAuditMetadata(input.metadata);

  await prisma.adminAuditLog.create({
    data: {
      adminUserId: input.adminUserId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      metadataJson: JSON.stringify(metadata),
      ipAddress: input.ipAddress?.slice(0, 120) ?? null,
      userAgent: input.userAgent?.slice(0, 500) ?? null
    }
  });
}

function parseMetadata(metadataJson: string) {
  try {
    const parsed = JSON.parse(metadataJson) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? sanitizeAdminAuditMetadata(parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function toPublicAdminAuditLog(log: {
  id: string;
  adminUserId: string;
  action: string;
  targetType: string;
  targetId: string | null;
  metadataJson: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}): PublicAdminAuditLog {
  return {
    id: log.id,
    adminUserId: log.adminUserId,
    action: log.action,
    targetType: log.targetType,
    targetId: log.targetId,
    metadata: parseMetadata(log.metadataJson),
    ipAddress: log.ipAddress,
    userAgent: log.userAgent,
    createdAt: log.createdAt.toISOString()
  };
}

export function normalizeAdminAuditLimit(value: string | null | undefined) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return 30;
  return Math.min(Math.max(parsed, 1), 100);
}
