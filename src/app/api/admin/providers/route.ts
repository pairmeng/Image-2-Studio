import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { writeAdminAuditLog } from "@/lib/server/admin-audit";
import { listAdminProviderSettings, savePlatformProviderSetting } from "@/lib/server/provider-config";
import { handleRouteError, readJsonBody } from "@/lib/server/responses";
import { getRequestClientIp } from "@/lib/server/security";
import { listProviderAdapters } from "@/lib/server/providers";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json({
      providers: await listAdminProviderSettings(),
      adapters: listProviderAdapters()
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
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

    const provider = await savePlatformProviderSetting(body.providerId ?? "", body);
    await writeAdminAuditLog({
      adminUserId: admin.id,
      action: "provider.create",
      targetType: "platform-provider",
      targetId: provider.providerId,
      metadata: {
        providerId: provider.providerId,
        adapterId: provider.adapterId,
        enabled: provider.enabled,
        keyConfigured: Boolean(body.key),
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
