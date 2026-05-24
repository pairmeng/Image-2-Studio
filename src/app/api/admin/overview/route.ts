import { NextResponse } from "next/server";
import { requireAdmin, toPublicUser } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import { getAppSettings } from "@/lib/server/provider-config";
import { handleRouteError } from "@/lib/server/responses";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAdmin();
    const [settings, users, images, usage] = await Promise.all([
      getAppSettings(),
      prisma.user.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.imageRecord.findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { user: { select: { email: true } } }
      }),
      prisma.usageDaily.findMany({
        orderBy: { updatedAt: "desc" },
        take: 100,
        include: { user: { select: { email: true } } }
      })
    ]);

    return NextResponse.json({
      settings,
      users: users.map(toPublicUser),
      images: images.map((image) => ({
        id: image.id,
        userEmail: image.user.email,
        provider: image.provider,
        model: image.model,
        prompt: image.prompt,
        createdAt: image.createdAt.toISOString()
      })),
      usage: usage.map((item) => ({
        id: item.id,
        userEmail: item.user.email,
        date: item.date,
        platformUses: item.platformUses
      }))
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
