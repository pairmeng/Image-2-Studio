import type { ImageProvider, ProviderRequest, ProviderResult } from "../provider-types";

const ONE_BY_ONE_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

export const mockProvider: ImageProvider = {
  adapterId: "mock",
  label: "Mock Provider",
  async createImage(request: ProviderRequest): Promise<ProviderResult> {
    return {
      imageBuffer: Buffer.from(ONE_BY_ONE_PNG_BASE64, "base64"),
      mimeType: "image/png",
      providerMeta: {
        mock: true,
        model: request.model.modelId
      }
    };
  },
  async testConnection(config) {
    return {
      ok: config.enabled,
      message: config.enabled ? "Mock provider is enabled." : "Mock provider is disabled."
    };
  },
  sanitizeMeta(meta) {
    return {
      mock: meta.mock === true,
      model: typeof meta.model === "string" ? meta.model.slice(0, 120) : null
    };
  }
};
