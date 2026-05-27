import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { retryImageBatchItems } from "@/lib/server/batches";
import { scheduleImageJob } from "@/lib/server/image-jobs";
import { handleRouteError } from "@/lib/server/responses";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const result = await retryImageBatchItems(user.id, id);

    await Promise.all(result.jobIds.map((jobId) => scheduleImageJob(jobId)));

    return NextResponse.json(result.batch);
  } catch (error) {
    return handleRouteError(error);
  }
}
