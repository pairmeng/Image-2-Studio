import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { deleteHistoryRecords, normalizeHistoryLimit, readHistoryPage } from "@/lib/server/history";
import { handleRouteError, readJsonBody } from "@/lib/server/responses";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const url = new URL(request.url);
    const page = await readHistoryPage(user.id, {
      limit: normalizeHistoryLimit(url.searchParams.get("limit")),
      cursor: url.searchParams.get("cursor"),
      batchId: url.searchParams.get("batchId"),
      projectId: url.searchParams.get("projectId"),
      tag: url.searchParams.get("tag")
    });

    return NextResponse.json(page);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireUser();
    const body = await readJsonBody<{ ids?: unknown }>(request);
    const deletedIds = await deleteHistoryRecords(user.id, body.ids);

    return NextResponse.json({ ok: true, deletedIds });
  } catch (error) {
    return handleRouteError(error);
  }
}
