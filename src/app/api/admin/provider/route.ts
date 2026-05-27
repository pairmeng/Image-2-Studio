import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { writeAdminAuditLog } from "@/lib/server/admin-audit";
import { savePlatformProviderConfig } from "@/lib/server/provider-config";
import { handleRouteError, readJsonBody } from "@/lib/server/responses";
import { getRequestClientIp } from "@/lib/server/security";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    const body = await readJsonBody<{
      keys?: Partial<Record<string, string>>;
      baseUrls?: Partial<Record<string, string>>;
      models?: Partial<Record<string, string>>;
    }>(request);

    await savePlatformProviderConfig({
      keys: {
        openai: typeof body.keys?.openai === "string" ? body.keys.openai : undefined
      },
      baseUrls: {
        openai: typeof body.baseUrls?.openai === "string" ? body.baseUrls.openai : undefined
      },
      models: {
        openai: typeof body.models?.openai === "string" ? body.models.openai : undefined
      }
    });
    await writeAdminAuditLog({
      adminUserId: admin.id,
      action: "provider.update",
      targetType: "platform-provider",
      targetId: "openai",
      metadata: {
        openaiKeyConfigured: Boolean(body.keys?.openai),
        baseUrlUpdated: typeof body.baseUrls?.openai === "string",
        modelUpdated: typeof body.models?.openai === "string"
      },
      ipAddress: getRequestClientIp(request),
      userAgent: request.headers.get("user-agent")
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
