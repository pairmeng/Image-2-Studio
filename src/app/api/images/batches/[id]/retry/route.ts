import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { retryImageBatchItems } from "@/lib/server/batches";
import { scheduleImageJob } from "@/lib/server/image-jobs";
import { handleRouteError, readJsonBody } from "@/lib/server/responses";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const body = await readJsonBody<{ itemIds?: unknown }>(request);
    const result = await retryImageBatchItems(user.id, id, body.itemIds);

    await Promise.all(result.jobIds.map((jobId) => scheduleImageJob(jobId)));

    return NextResponse.json(result.batch);
  } catch (error) {
    return handleRouteError(error);
  }
}
