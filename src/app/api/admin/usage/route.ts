import { NextResponse } from "next/server";
import { normalizeAdminUsageRange, readAdminUsage } from "@/lib/server/admin-usage";
import { requireAdmin } from "@/lib/server/auth";
import { handleRouteError } from "@/lib/server/responses";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const url = new URL(request.url);
    const usage = await readAdminUsage({
      range: normalizeAdminUsageRange(url.searchParams.get("range")),
      userId: url.searchParams.get("userId")
    });

    return NextResponse.json(usage);
  } catch (error) {
    return handleRouteError(error);
  }
}
