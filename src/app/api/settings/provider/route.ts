import { NextResponse } from "next/server";
import { isProviderId } from "@/lib/models";
import { requireUser } from "@/lib/server/auth";
import { getUserProviderSettings, saveProviderConfig } from "@/lib/server/provider-config";
import { handleRouteError, readJsonBody } from "@/lib/server/responses";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    const config = await getUserProviderSettings(user.id);
    return NextResponse.json(config);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await readJsonBody<{
      activeProvider?: string;
      keys?: Partial<Record<string, string>>;
      baseUrls?: Partial<Record<string, string>>;
      models?: Partial<Record<string, string>>;
    }>(request);

    const activeProvider = body.activeProvider && isProviderId(body.activeProvider)
      ? body.activeProvider
      : undefined;
    const keys: Partial<Record<string, string>> = {};
    const baseUrls: Partial<Record<string, string>> = {};
    const models: Partial<Record<string, string>> = {};

    for (const [providerId, value] of Object.entries(body.keys ?? {})) {
      if (isProviderId(providerId) && typeof value === "string") keys[providerId] = value;
    }

    for (const [providerId, value] of Object.entries(body.baseUrls ?? {})) {
      if (isProviderId(providerId) && typeof value === "string") baseUrls[providerId] = value;
    }

    for (const [providerId, value] of Object.entries(body.models ?? {})) {
      if (isProviderId(providerId) && typeof value === "string") models[providerId] = value;
    }

    const config = await saveProviderConfig(user.id, { activeProvider, keys, baseUrls, models });
    return NextResponse.json(config);
  } catch (error) {
    return handleRouteError(error);
  }
}
