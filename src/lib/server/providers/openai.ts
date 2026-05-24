import OpenAI from "openai";
import type { ImageProvider, InputImage, ProviderRequest, ProviderResult } from "../provider-types";

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

function getB64Image(response: { data?: Array<{ b64_json?: string | null }> }) {
  const b64 = response.data?.[0]?.b64_json;

  if (!b64) {
    throw new Error("OpenAI did not return image data.");
  }

  return Buffer.from(b64, "base64");
}

export const openaiProvider: ImageProvider = {
  async createImage(request: ProviderRequest): Promise<ProviderResult> {
    const client = getClient(request);
    const common = {
      model: request.model.modelId,
      prompt: request.prompt,
      size: request.size,
      quality: request.quality,
      output_format: "png"
    };

    if (request.mode === "text-to-image") {
      const response = await client.images.generate(common as never);

      return {
        imageBuffer: getB64Image(response),
        mimeType: "image/png",
        providerMeta: {
          revisedPrompt: response.data?.[0]?.revised_prompt ?? null
        }
      };
    }

    if (request.inputImages.length === 0) {
      throw new Error("Image-to-image needs at least one reference image.");
    }

    const files = request.inputImages.map(inputImageToFile);
    const response = await client.images.edit({
      ...common,
      image: files.length === 1 ? files[0] : files,
      input_fidelity: request.inputFidelity
    } as never);

    return {
      imageBuffer: getB64Image(response),
      mimeType: "image/png",
      providerMeta: {
        revisedPrompt: response.data?.[0]?.revised_prompt ?? null
      }
    };
  }
};
