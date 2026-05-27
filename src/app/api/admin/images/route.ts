import { NextResponse } from "next/server";
import { normalizeAdminImageFilters, readAdminImagesPage } from "@/lib/server/admin-images";
import { requireAdmin } from "@/lib/server/auth";
import { handleRouteError } from "@/lib/server/responses";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const url = new URL(request.url);
    const page = await readAdminImagesPage(normalizeAdminImageFilters(url.searchParams));

    return NextResponse.json(page);
  } catch (error) {
    return handleRouteError(error);
  }
}
