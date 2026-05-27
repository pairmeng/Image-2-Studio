import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { archiveHistoryRecords } from "@/lib/server/history";
import { handleRouteError, readJsonBody } from "@/lib/server/responses";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await readJsonBody<{
      ids?: unknown;
      archived?: unknown;
    }>(request);
    const result = await archiveHistoryRecords(user.id, body);

    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
