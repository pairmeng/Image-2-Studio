import { NextResponse } from "next/server";
import type { CatalogResponse } from "@/lib/types";
import { getModelsForResolvedProvider, getPublicProviderConfig, getResolvedProviderConfig } from "@/lib/server/provider-config";
import { requireUser } from "@/lib/server/auth";
import { handleRouteError } from "@/lib/server/responses";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    const providerConfig = await getPublicProviderConfig(user.id);
    const providers = providerConfig.providers.filter((provider) => provider.enabled);
    const models = (await Promise.all(providers.map(async (provider) => {
      const resolved = await getResolvedProviderConfig(user.id, provider.providerId);
      return getModelsForResolvedProvider(resolved);
    }))).flat();
    const body: CatalogResponse = {
      providers,
      models
    };

    return NextResponse.json(body);
  } catch (error) {
    return handleRouteError(error);
  }
}
