import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { writeAdminAuditLog } from "@/lib/server/admin-audit";
import { prisma } from "@/lib/server/db";
import {
  getAppSettings,
  sanitizeFaviconUrl,
  sanitizeLogoUrl,
  sanitizeSiteTitle,
  toPublicAppSettings
} from "@/lib/server/provider-config";
import {
  getImageQueueSettingsUpdate,
  invalidateImageQueueSettingsCache,
  refreshImageQueueSettings
} from "@/lib/server/image-queue-settings";
import { handleRouteError, readJsonBody } from "@/lib/server/responses";
import { getRequestClientIp } from "@/lib/server/security";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    const body = await readJsonBody<{
      registrationOpen?: boolean;
      dailyPlatformQuota?: number;
      siteTitle?: string;
      faviconUrl?: string;
      logoUrl?: string;
      imageQueueMode?: string;
      imageJobConcurrency?: number;
      imageJobUserConcurrency?: number;
      imageQueueRedisUrl?: string;
      clearImageQueueRedisUrl?: boolean;
      imageQueuePrefix?: string;
      imageWorkerConcurrency?: number;
      imageQueueAttempts?: number;
      imageQueueBackoffMs?: number;
    }>(request);
    const current = await getAppSettings();
    const siteTitle = sanitizeSiteTitle(body.siteTitle);
    const faviconUrl = sanitizeFaviconUrl(body.faviconUrl);
    const logoUrl = sanitizeLogoUrl(body.logoUrl);

    if (typeof body.siteTitle === "string" && siteTitle === undefined) {
      return NextResponse.json({ error: "Site title is invalid." }, { status: 400 });
    }

    if (typeof body.faviconUrl === "string" && faviconUrl === undefined) {
      return NextResponse.json({ error: "Favicon URL must be empty, a site path, or an http(s) URL." }, { status: 400 });
    }

    if (typeof body.logoUrl === "string" && logoUrl === undefined) {
      return NextResponse.json({ error: "Logo URL must be empty, a site path, or an http(s) URL." }, { status: 400 });
    }

    const queueUpdate = getImageQueueSettingsUpdate(body);
    if (queueUpdate.error) {
      return NextResponse.json({ error: queueUpdate.error }, { status: 400 });
    }

    const settings = await prisma.appSetting.update({
      where: { id: current.id },
      data: {
        registrationOpen: typeof body.registrationOpen === "boolean" ? body.registrationOpen : current.registrationOpen,
        dailyPlatformQuota: Number.isFinite(body.dailyPlatformQuota)
          ? Math.max(0, Math.floor(body.dailyPlatformQuota ?? current.dailyPlatformQuota))
          : current.dailyPlatformQuota,
        siteTitle: siteTitle !== undefined ? siteTitle : current.siteTitle,
        faviconUrl: faviconUrl !== undefined ? faviconUrl : current.faviconUrl,
        logoUrl: logoUrl !== undefined ? logoUrl : current.logoUrl,
        ...queueUpdate.data
      }
    });
    invalidateImageQueueSettingsCache();
    const queueSettings = await refreshImageQueueSettings({ force: true });
    await writeAdminAuditLog({
      adminUserId: admin.id,
      action: "settings.update",
      targetType: "app-settings",
      targetId: settings.id,
      metadata: {
        registrationOpen: settings.registrationOpen,
        dailyPlatformQuota: settings.dailyPlatformQuota,
        siteTitleUpdated: typeof body.siteTitle === "string",
        brandingUpdated: typeof body.faviconUrl === "string" || typeof body.logoUrl === "string",
        queueMode: queueSettings.mode,
        queuePrefix: queueSettings.imageQueuePrefix,
        queueConcurrency: queueSettings.imageJobConcurrency,
        workerConcurrency: queueSettings.imageWorkerConcurrency,
        redisConfigured: queueSettings.redisConfigured,
        redisTarget: queueSettings.redisTarget
      },
      ipAddress: getRequestClientIp(request),
      userAgent: request.headers.get("user-agent")
    });

    return NextResponse.json({ settings: toPublicAppSettings(settings) });
  } catch (error) {
    return handleRouteError(error);
  }
}
