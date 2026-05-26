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
    const keys: Partial<Record<"openai", string>> = {};

    if (typeof body.keys?.openai === "string") {
      keys.openai = body.keys.openai;
    }

    const baseUrls: Partial<Record<"openai", string>> = {};
    const models: Partial<Record<"openai", string>> = {};

    if (typeof body.baseUrls?.openai === "string") {
      baseUrls.openai = body.baseUrls.openai;
    }

    if (typeof body.models?.openai === "string") {
      models.openai = body.models.openai;
    }

    const config = await saveProviderConfig(user.id, { activeProvider, keys, baseUrls, models });
    return NextResponse.json(config);
  } catch (error) {
    return handleRouteError(error);
  }
}
