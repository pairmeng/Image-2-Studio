import { NextResponse } from "next/server";
import { requireAdmin, toPublicUser } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import { getImageJobQueueSnapshot } from "@/lib/server/image-jobs";
import { getPublicPlatformProviderConfig, readPublicAppSettings } from "@/lib/server/provider-config";
import { handleRouteError } from "@/lib/server/responses";
import { getBeijingDateKey } from "@/lib/server/usage";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAdmin();
    const todayKey = getBeijingDateKey();
    const todayStart = new Date(`${todayKey}T00:00:00.000+08:00`);
    const [
      settings,
      users,
      images,
      usage,
      jobQueue,
      platformProvider,
      totalImages,
      totalJobs,
      todayImages,
      todayFailedJobs,
      todayUsage
    ] = await Promise.all([
      readPublicAppSettings(),
      prisma.user.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.imageRecord.findMany({
        orderBy: { createdAt: "desc" },
        take: 12,
        include: { user: { select: { email: true } } }
      }),
      prisma.usageDaily.findMany({
        orderBy: { updatedAt: "desc" },
        take: 12,
        include: { user: { select: { email: true } } }
      }),
      getImageJobQueueSnapshot(),
      getPublicPlatformProviderConfig(),
      prisma.imageRecord.count(),
      prisma.imageJob.count(),
      prisma.imageRecord.count({
        where: {
          createdAt: {
            gte: todayStart
          }
        }
      }),
      prisma.imageJob.count({
        where: {
          status: "failed",
          createdAt: {
            gte: todayStart
          }
        }
      }),
      prisma.usageDaily.aggregate({
        where: {
          date: todayKey
        },
        _sum: {
          platformUses: true
        }
      })
    ]);

    return NextResponse.json({
      totals: {
        users: users.length,
        disabledUsers: users.filter((user) => user.disabled).length,
        images: totalImages,
        jobs: totalJobs
      },
      today: {
        platformUses: todayUsage._sum.platformUses ?? 0,
        generatedImages: todayImages,
        failedJobs: todayFailedJobs
      },
      settings,
      platformProvider,
      jobQueue,
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
