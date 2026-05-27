import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { pauseImageBatchForUser } from "@/lib/server/image-batch-actions";
import { handleRouteError } from "@/lib/server/responses";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const batch = await pauseImageBatchForUser(user.id, id);

    return NextResponse.json(batch);
  } catch (error) {
    return handleRouteError(error);
  }
}
