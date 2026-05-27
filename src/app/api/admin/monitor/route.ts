import { NextResponse } from "next/server";
import { readAdminMonitor } from "@/lib/server/admin-monitor";
import { requireAdmin } from "@/lib/server/auth";
import { handleRouteError } from "@/lib/server/responses";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAdmin();
    const monitor = await readAdminMonitor();

    return NextResponse.json(monitor);
  } catch (error) {
    return handleRouteError(error);
  }
}
