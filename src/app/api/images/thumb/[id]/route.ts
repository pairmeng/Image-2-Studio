import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { readThumbnailMetaForUser } from "@/lib/server/files";
import {
  createImageResponseContext,
  createNotModifiedImageResponse,
  createStreamedImageResponse,
  isFreshImageRequest
} from "@/lib/server/image-response";
import { handleRouteError } from "@/lib/server/responses";

export const runtime = "nodejs";

async function getThumbnailResponseContext(context: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await context.params;
  const image = await readThumbnailMetaForUser(user.id, id);
  return createImageResponseContext(image);
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const responseContext = await getThumbnailResponseContext(context);
    if (isFreshImageRequest(request, responseContext)) {
      return createNotModifiedImageResponse(responseContext.headers);
    }

    return createStreamedImageResponse(responseContext);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function HEAD(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const responseContext = await getThumbnailResponseContext(context);
    if (isFreshImageRequest(request, responseContext)) {
      return createNotModifiedImageResponse(responseContext.headers);
    }

    return new NextResponse(null, { headers: responseContext.headers });
  } catch (error) {
    return handleRouteError(error);
  }
}
