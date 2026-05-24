import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { createImageJobFromFormData, startImageJob } from "@/lib/server/image-jobs";
import { handleRouteError } from "@/lib/server/responses";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const formData = await request.formData();
    const job = await createImageJobFromFormData(user.id, formData);
    startImageJob(job.jobId);

    return NextResponse.json(job, { status: 202 });
  } catch (error) {
    return handleRouteError(error);
  }
}
