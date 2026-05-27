import { NextResponse } from "next/server";
import { readAdminJobs } from "@/lib/server/admin-jobs";
import { requireAdmin } from "@/lib/server/auth";
import { handleRouteError } from "@/lib/server/responses";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const url = new URL(request.url);
    const jobs = await readAdminJobs({
      limit: url.searchParams.get("limit"),
      cursor: url.searchParams.get("cursor"),
      status: url.searchParams.get("status"),
      userId: url.searchParams.get("userId"),
      provider: url.searchParams.get("provider"),
      model: url.searchParams.get("model"),
      dateFrom: url.searchParams.get("dateFrom"),
      dateTo: url.searchParams.get("dateTo"),
      q: url.searchParams.get("q")
    });

    return NextResponse.json(jobs);
  } catch (error) {
    return handleRouteError(error);
  }
}
