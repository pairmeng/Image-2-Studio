import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { readStoredImageForUser } from "@/lib/server/files";
import { handleRouteError } from "@/lib/server/responses";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const image = await readStoredImageForUser(user.id, id);

    return new NextResponse(image.buffer, {
      headers: {
        "content-type": image.mimeType,
        "cache-control": "private, max-age=3600"
      }
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
