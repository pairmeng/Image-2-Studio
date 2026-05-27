import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import {
  normalizeAdminAuditLimit,
  toPublicAdminAuditLog
} from "@/lib/server/admin-audit";
import { handleRouteError } from "@/lib/server/responses";

export const runtime = "nodejs";

function parseDate(value: string | null) {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const url = new URL(request.url);
    const limit = normalizeAdminAuditLimit(url.searchParams.get("limit"));
    const cursor = url.searchParams.get("cursor")?.trim();
    const action = url.searchParams.get("action")?.trim();
    const adminUserId = url.searchParams.get("adminUserId")?.trim();
    const dateFrom = parseDate(url.searchParams.get("dateFrom"));
    const dateTo = parseDate(url.searchParams.get("dateTo"));

    const logs = await prisma.adminAuditLog.findMany({
      where: {
        ...(action ? { action } : {}),
        ...(adminUserId ? { adminUserId } : {}),
        ...(dateFrom || dateTo ? {
          createdAt: {
            ...(dateFrom ? { gte: dateFrom } : {}),
            ...(dateTo ? { lte: dateTo } : {})
          }
        } : {})
      },
      orderBy: [
        { createdAt: "desc" },
        { id: "desc" }
      ],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
    });
    const page = logs.slice(0, limit);

    return NextResponse.json({
      records: page.map(toPublicAdminAuditLog),
      nextCursor: logs.length > limit ? page.at(-1)?.id : undefined
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
