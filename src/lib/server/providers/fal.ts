import { fal } from "@fal-ai/client";
import type { ImageProvider, ProviderRequest, ProviderResult } from "../provider-types";

function getFalImageSize(aspectRatio?: string, size?: string) {
  if (aspectRatio === "auto") return "portrait_4_3";
  if (aspectRatio === "16:9") return "landscape_16_9";
  if (aspectRatio === "9:16") return "portrait_16_9";
  if (aspectRatio === "2:1") return "landscape_16_9";
  if (aspectRatio === "1:2") return "portrait_16_9";
  if (aspectRatio === "3:2") return "landscape_4_3";
  if (aspectRatio === "2:3") return "portrait_4_3";
  if (aspectRatio === "4:3") return "landscape_4_3";
  if (aspectRatio === "3:4") return "portrait_4_3";
  if (size === "1536x1024") return "landscape_4_3";
  if (size === "1024x1536") return "portrait_4_3";
  return "square_hd";
}

function findImageUrl(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;

  const data = value as Record<string, unknown>;
  const images = data.images;

  if (Array.isArray(images)) {
    for (const image of images) {
      if (image && typeof image === "object" && typeof (image as Record<string, unknown>).url === "string") {
        return (image as Record<string, string>).url;
      }
    }
  }

  if (typeof data.image === "object" && data.image && typeof (data.image as Record<string, unknown>).url === "string") {
    return (data.image as Record<string, string>).url;
  }

  if (typeof data.url === "string") return data.url;

  return null;
}

export const falProvider: ImageProvider = {
  async createImage(request: ProviderRequest): Promise<ProviderResult> {
    const credentials = request.credentials.apiKey;

    if (!credentials) {
      throw new Error("fal provider is not configured. Set FAL_KEY.");
    }

    if (request.mode !== "text-to-image") {
      throw new Error("The configured fal model only supports text-to-image in this MVP.");
    }

    fal.config({ credentials });

    const result = await fal.subscribe(request.model.modelId, {
      input: {
        prompt: request.prompt,
        image_size: getFalImageSize(request.aspectRatio, request.size),
        num_images: 1,
        output_format: "png"
      }
    });

    const raw = result as { data?: unknown; requestId?: string };
    const imageUrl = findImageUrl(raw.data);

    if (!imageUrl) {
      throw new Error("fal did not return an image URL.");
    }

    const download = await fetch(imageUrl);

    if (!download.ok) {
      throw new Error("fal returned an image URL that could not be downloaded.");
    }

    const contentType = download.headers.get("content-type")?.split(";")[0] || "image/png";
    const imageBuffer = Buffer.from(await download.arrayBuffer());

    return {
      imageBuffer,
      mimeType: contentType.startsWith("image/") ? contentType : "image/png",
      providerMeta: {
        requestId: raw.requestId ?? null,
        remoteImageUrl: imageUrl
      }
    };
  }
};
