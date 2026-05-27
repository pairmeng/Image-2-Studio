import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { updateHistoryTags } from "@/lib/server/history";
import { handleRouteError, readJsonBody } from "@/lib/server/responses";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await readJsonBody<{
      ids?: unknown;
      tags?: unknown;
    }>(request);
    const result = await updateHistoryTags(user.id, body);

    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
