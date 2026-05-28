import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { writeAdminAuditLog } from "@/lib/server/admin-audit";
import { getResolvedProviderConfig, updateProviderHealth } from "@/lib/server/provider-config";
import { getProviderAdapter } from "@/lib/server/providers";
import { handleRouteError } from "@/lib/server/responses";
import { assertRateLimit, getRequestClientIp } from "@/lib/server/security";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ providerId: string }> }) {
  try {
    const admin = await requireAdmin();
    const { providerId } = await context.params;
    await assertRateLimit("admin:provider-test", `${admin.id}:${providerId}`, { limit: 10, windowMs: 15 * 60 * 1000 });
    const resolved = await getResolvedProviderConfig(admin.id, providerId);
    const adapter = getProviderAdapter(resolved.adapterId);
    const result = adapter.testConnection
      ? await adapter.testConnection({
        providerId: resolved.providerId,
        adapterId: resolved.adapterId,
        label: resolved.label,
        enabled: resolved.enabled,
        apiKey: resolved.apiKey,
        baseUrl: resolved.baseUrl,
        defaultModel: resolved.model,
        models: resolved.models,
        source: resolved.source
      })
      : { ok: Boolean(resolved.apiKey && resolved.enabled), message: "Configuration was checked locally." };

    await updateProviderHealth(providerId, result);
    await writeAdminAuditLog({
      adminUserId: admin.id,
      action: "provider.health.check",
      targetType: "platform-provider",
      targetId: providerId,
      metadata: {
        providerId,
        adapterId: resolved.adapterId,
        ok: result.ok,
        message: result.message
      },
      ipAddress: getRequestClientIp(request),
      userAgent: request.headers.get("user-agent")
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
