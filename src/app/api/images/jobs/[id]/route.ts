import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { getImageJobForUser } from "@/lib/server/image-jobs";
import { handleRouteError } from "@/lib/server/responses";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const job = await getImageJobForUser(user.id, id);

    return NextResponse.json(job);
  } catch (error) {
    return handleRouteError(error);
  }
}
