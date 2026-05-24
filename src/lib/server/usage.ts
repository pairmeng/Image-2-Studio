import { AppError } from "./errors";
import { getAppSettings } from "./provider-config";
import { prisma } from "./db";

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export async function assertAndConsumePlatformQuota(userId: string) {
  const settings = await getAppSettings();
  const date = todayKey();

  const usage = await prisma.usageDaily.upsert({
    where: {
      userId_date: {
        userId,
        date
      }
    },
    update: {},
    create: {
      userId,
      date
    }
  });

  if (usage.platformUses >= settings.dailyPlatformQuota) {
    throw new AppError("Daily platform quota reached.", 429);
  }

  await prisma.usageDaily.update({
    where: { id: usage.id },
    data: { platformUses: { increment: 1 } }
  });
}
