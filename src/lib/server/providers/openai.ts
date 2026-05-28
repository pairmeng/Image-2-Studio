import OpenAI from "openai";
import type { ImageProvider, InputImage, ProviderRequest, ProviderResult } from "../provider-types";

type OpenAIImageResponse = {
  data?: Array<{
    b64_json?: string | null;
    revised_prompt?: string | null;
    url?: string | null;
  }>;
};

type ImagePayload = Record<string, unknown>;

function getClient(request: ProviderRequest) {
  const apiKey = request.credentials.apiKey;
  if (!apiKey) {
    throw new Error("OpenAI provider is not configured. Set OPENAI_API_KEY.");
  }

  return new OpenAI({
    apiKey,
    baseURL: request.credentials.baseUrl || undefined,
    maxRetries: 0
  });
}

function inputImageToFile(image: InputImage) {
  const blob = new Blob([image.buffer as unknown as BlobPart], { type: image.mimeType });
  return new File([blob], image.filename, { type: image.mimeType });
}

function compactPayload(payload: ImagePayload) {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined && value !== null && value !== ""));
}

function isOpenAICompatibleGateway(request: ProviderRequest) {
  return Boolean(request.credentials.baseUrl);
}

function getCommonPayload(request: ProviderRequest) {
  const payload: ImagePayload = {
    model: request.model.modelId,
    prompt: request.prompt,
    size: request.size,
    quality: request.quality
  };

  if (!isOpenAICompatibleGateway(request)) {
    payload.output_format = "png";
  }

  return compactPayload(payload);
}

function parseDataUrl(value: string) {
  const match = /^data:([^;,]+)?;base64,(.+)$/i.exec(value);
  if (!match) return null;

  return {
    imageBuffer: Buffer.from(match[2], "base64"),
    mimeType: match[1] || "image/png"
  };
}

async function fetchImageUrl(url: string): Promise<ProviderResult> {
  const dataUrl = parseDataUrl(url);
  if (dataUrl) return dataUrl;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`OpenAI image URL download failed: ${response.status} ${response.statusText}`.trim());
  }

  const imageBuffer = Buffer.from(await response.arrayBuffer());
  const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim() || "image/png";

  return { imageBuffer, mimeType };
}

async function getImageResult(response: OpenAIImageResponse): Promise<ProviderResult> {
  const firstImage = response.data?.[0];
  const b64 = firstImage?.b64_json;
  if (b64) {
    return {
      imageBuffer: Buffer.from(b64, "base64"),
      mimeType: "image/png"
    };
  }

  if (firstImage?.url) {
    return fetchImageUrl(firstImage.url);
  }

  throw new Error("OpenAI did not return image data.");
}

export const openaiProvider: ImageProvider = {
  adapterId: "openai",
  label: "OpenAI",
  async createImage(request: ProviderRequest): Promise<ProviderResult> {
    const client = getClient(request);
    const common = getCommonPayload(request);

    if (request.mode === "text-to-image") {
      const response = await client.images.generate(common as never) as OpenAIImageResponse;
      const result = await getImageResult(response);

      return {
        ...result,
        providerMeta: {
          revisedPrompt: response.data?.[0]?.revised_prompt ?? null
        }
      };
    }

    if (request.inputImages.length === 0) {
      throw new Error("Image-to-image needs at least one reference image.");
    }

    const files = request.inputImages.map(inputImageToFile);
    const editPayload = compactPayload({
      ...common,
      image: files.length === 1 ? files[0] : files,
      input_fidelity: isOpenAICompatibleGateway(request) ? undefined : request.inputFidelity
    });
    const response = await client.images.edit({
      ...editPayload
    } as never) as OpenAIImageResponse;
    const result = await getImageResult(response);

    return {
      ...result,
      providerMeta: {
        revisedPrompt: response.data?.[0]?.revised_prompt ?? null
      }
    };
  },
  async testConnection(config) {
    if (!config.apiKey) {
      return { ok: false, message: "API key is missing." };
    }

    return { ok: true, message: config.baseUrl ? "OpenAI-compatible configuration is present." : "OpenAI configuration is present." };
  },
  sanitizeMeta(meta) {
    return {
      revisedPrompt: typeof meta.revisedPrompt === "string" ? meta.revisedPrompt.slice(0, 2000) : null
    };
  }
};
