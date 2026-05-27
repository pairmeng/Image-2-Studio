import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { readImageRecordThumbnailMetaForAdmin } from "@/lib/server/files";
import {
  createImageResponseContext,
  createNotModifiedImageResponse,
  createStreamedImageResponse,
  isFreshImageRequest
} from "@/lib/server/image-response";
import { handleRouteError } from "@/lib/server/responses";

export const runtime = "nodejs";

async function getAdminImageThumbnailResponseContext(context: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await context.params;
  const image = await readImageRecordThumbnailMetaForAdmin(id);
  return createImageResponseContext(image);
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const responseContext = await getAdminImageThumbnailResponseContext(context);
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
    const responseContext = await getAdminImageThumbnailResponseContext(context);
    if (isFreshImageRequest(request, responseContext)) {
      return createNotModifiedImageResponse(responseContext.headers);
    }

    return new NextResponse(null, { headers: responseContext.headers });
  } catch (error) {
    return handleRouteError(error);
  }
}
