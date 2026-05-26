import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import { getAppSettings, sanitizeFaviconUrl, sanitizeLogoUrl, sanitizeSiteTitle } from "@/lib/server/provider-config";
import { handleRouteError, readJsonBody } from "@/lib/server/responses";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = await readJsonBody<{
      registrationOpen?: boolean;
      dailyPlatformQuota?: number;
      siteTitle?: string;
      faviconUrl?: string;
      logoUrl?: string;
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

    const settings = await prisma.appSetting.update({
      where: { id: current.id },
      data: {
        registrationOpen: typeof body.registrationOpen === "boolean" ? body.registrationOpen : current.registrationOpen,
        dailyPlatformQuota: Number.isFinite(body.dailyPlatformQuota)
          ? Math.max(0, Math.floor(body.dailyPlatformQuota ?? current.dailyPlatformQuota))
          : current.dailyPlatformQuota,
        siteTitle: siteTitle !== undefined ? siteTitle : current.siteTitle,
        faviconUrl: faviconUrl !== undefined ? faviconUrl : current.faviconUrl,
        logoUrl: logoUrl !== undefined ? logoUrl : current.logoUrl
      }
    });

    return NextResponse.json({ settings });
  } catch (error) {
    return handleRouteError(error);
  }
}
