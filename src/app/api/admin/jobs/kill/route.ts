import { NextResponse } from "next/server";
import { runAdminJobAction } from "@/lib/server/admin-jobs";
import { requireAdmin } from "@/lib/server/auth";
import { handleRouteError, readJsonBody } from "@/lib/server/responses";
import { getRequestClientIp } from "@/lib/server/security";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    const body = await readJsonBody<{ jobIds?: unknown }>(request);
    const result = await runAdminJobAction({
      adminUserId: admin.id,
      action: "kill",
      jobIds: body.jobIds,
      ipAddress: getRequestClientIp(request),
      userAgent: request.headers.get("user-agent")
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
