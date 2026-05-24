import { NextResponse } from "next/server";
import { createFalTextModel, createOpenAICompatibleModel, MODEL_CATALOG, PROVIDERS } from "@/lib/models";
import type { CatalogResponse } from "@/lib/types";
import { getPublicProviderConfig } from "@/lib/server/provider-config";
import { requireUser } from "@/lib/server/auth";
import { handleRouteError } from "@/lib/server/responses";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    const providerConfig = await getPublicProviderConfig(user.id);
    const customOpenAIModel = providerConfig.models.openai;
    const customFalModel = providerConfig.models.fal;
    const customModels = [
      customOpenAIModel && !MODEL_CATALOG.some((model) => model.provider === "openai" && model.modelId === customOpenAIModel)
        ? createOpenAICompatibleModel(customOpenAIModel)
        : null,
      customFalModel && !MODEL_CATALOG.some((model) => model.provider === "fal" && model.modelId === customFalModel)
        ? createFalTextModel(customFalModel)
        : null
    ].filter((model) => model !== null);
    const models = [...customModels, ...MODEL_CATALOG];
    const body: CatalogResponse = {
      providers: PROVIDERS.map((provider) => ({
        ...provider,
        configured: providerConfig.keys[provider.provider].configured
      })),
      models
    };

    return NextResponse.json(body);
  } catch (error) {
    return handleRouteError(error);
  }
}
