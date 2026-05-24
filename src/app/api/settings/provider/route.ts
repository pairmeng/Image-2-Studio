import { NextResponse } from "next/server";
import { isProviderId } from "@/lib/models";
import { requireUser } from "@/lib/server/auth";
import { getPublicProviderConfig, saveProviderConfig } from "@/lib/server/provider-config";
import { handleRouteError } from "@/lib/server/responses";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    const config = await getPublicProviderConfig(user.id);
    return NextResponse.json(config);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as {
      activeProvider?: string;
      keys?: Partial<Record<string, string>>;
      baseUrls?: Partial<Record<string, string>>;
      models?: Partial<Record<string, string>>;
    };

    const activeProvider = body.activeProvider && isProviderId(body.activeProvider)
      ? body.activeProvider
      : undefined;
    const keys: Partial<Record<"openai" | "fal", string>> = {};

    if (typeof body.keys?.openai === "string") {
      keys.openai = body.keys.openai;
    }

    if (typeof body.keys?.fal === "string") {
      keys.fal = body.keys.fal;
    }

    const baseUrls: Partial<Record<"openai" | "fal", string>> = {};
    const models: Partial<Record<"openai" | "fal", string>> = {};

    if (typeof body.baseUrls?.openai === "string") {
      baseUrls.openai = body.baseUrls.openai;
    }

    if (typeof body.models?.openai === "string") {
      models.openai = body.models.openai;
    }

    if (typeof body.models?.fal === "string") {
      models.fal = body.models.fal;
    }

    const config = await saveProviderConfig(user.id, { activeProvider, keys, baseUrls, models });
    return NextResponse.json(config);
  } catch (error) {
    return handleRouteError(error);
  }
}
