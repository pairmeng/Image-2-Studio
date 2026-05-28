import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { writeAdminAuditLog } from "@/lib/server/admin-audit";
import { getAdminProviderSetting, savePlatformProviderSetting } from "@/lib/server/provider-config";
import { handleRouteError, jsonError, readJsonBody } from "@/lib/server/responses";
import { getRequestClientIp } from "@/lib/server/security";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ providerId: string }> }) {
  try {
    await requireAdmin();
    const { providerId } = await context.params;
    const provider = await getAdminProviderSetting(providerId);
    if (!provider) return jsonError("Provider not found.", 404);

    return NextResponse.json({ provider });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ providerId: string }> }) {
  try {
    const admin = await requireAdmin();
    const { providerId } = await context.params;
    const body = await readJsonBody<{
      providerId?: string;
      adapterId?: string;
      label?: string;
      enabled?: boolean;
      key?: string;
      baseUrl?: string;
      defaultModel?: string;
      models?: Array<{ modelId: string; label?: string }>;
      priority?: number;
    }>(request);

    const provider = await savePlatformProviderSetting(providerId, body);
    await writeAdminAuditLog({
      adminUserId: admin.id,
      action: "provider.update",
      targetType: "platform-provider",
      targetId: provider.providerId,
      metadata: {
        providerId: provider.providerId,
        adapterId: provider.adapterId,
        enabled: provider.enabled,
        keyConfigured: Boolean(body.key),
        baseUrlUpdated: typeof body.baseUrl === "string",
        modelCount: body.models?.length ?? 0
      },
      ipAddress: getRequestClientIp(request),
      userAgent: request.headers.get("user-agent")
    });

    return NextResponse.json({ provider });
  } catch (error) {
    return handleRouteError(error);
  }
}
