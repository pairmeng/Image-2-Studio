import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { createImageBatchForUser, readImageBatchesForUser } from "@/lib/server/batches";
import { handleRouteError, readJsonBody } from "@/lib/server/responses";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const url = new URL(request.url);
    const batches = await readImageBatchesForUser(user.id, url.searchParams.get("limit"));

    return NextResponse.json(batches);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await readJsonBody<{
      name?: unknown;
      provider?: unknown;
      model?: unknown;
      mode?: unknown;
      prompts?: unknown;
      promptFormat?: unknown;
    }>(request);
    const batch = await createImageBatchForUser(user.id, body);

    return NextResponse.json(batch, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
