import { prisma } from "./db";
import { getBeijingDateKey } from "./usage";
import { normalizeAdminUsageRange, type AdminUsageRange } from "../admin-usage";

export type AdminUsageResponse = {
  range: AdminUsageRange;
  daily: Array<{
    date: string;
    platformUses: number;
    images: number;
    succeededJobs: number;
    failedJobs: number;
  }>;
  users: Array<{
    userId: string;
    userEmail: string;
    platformUses: number;
    images: number;
    succeededJobs: number;
    failedJobs: number;
  }>;
  models: Array<{
    provider: string;
    model: string;
    images: number;
    jobs: number;
  }>;
};

type UsageBucket = {
  date: string;
  platformUses: number;
  images: number;
  succeededJobs: number;
  failedJobs: number;
};

type UserUsageBucket = {
  userId: string;
  userEmail: string;
  platformUses: number;
  images: number;
  succeededJobs: number;
  failedJobs: number;
};

type ModelUsageBucket = {
  provider: string;
  model: string;
  images: number;
  jobs: number;
};

function getRangeDays(range: AdminUsageRange) {
  return range === "30d" ? 30 : 7;
}

export { normalizeAdminUsageRange };

function dateKeyToBeijingStart(dateKey: string) {
  return new Date(`${dateKey}T00:00:00.000+08:00`);
}

function createDateKeys(range: AdminUsageRange, now = new Date()) {
  const days = getRangeDays(range);
  const keys: string[] = [];
  const end = dateKeyToBeijingStart(getBeijingDateKey(now));

  for (let index = days - 1; index >= 0; index -= 1) {
    keys.push(getBeijingDateKey(new Date(end.getTime() - index * 24 * 60 * 60 * 1000)));
  }

  return keys;
}

function getRangeBounds(dateKeys: string[]) {
  const first = dateKeys[0];
  const last = dateKeys[dateKeys.length - 1];
  return {
    start: dateKeyToBeijingStart(first),
    end: new Date(dateKeyToBeijingStart(last).getTime() + 24 * 60 * 60 * 1000)
  };
}

function ensureUserBucket(map: Map<string, UserUsageBucket>, userId: string, userEmail: string) {
  const current = map.get(userId);
  if (current) return current;

  const bucket = {
    userId,
    userEmail,
    platformUses: 0,
    images: 0,
    succeededJobs: 0,
    failedJobs: 0
  };
  map.set(userId, bucket);
  return bucket;
}

function ensureModelBucket(map: Map<string, ModelUsageBucket>, provider: string, model: string) {
  const key = `${provider}:${model}`;
  const current = map.get(key);
  if (current) return current;

  const bucket = {
    provider,
    model,
    images: 0,
    jobs: 0
  };
  map.set(key, bucket);
  return bucket;
}

export async function readAdminUsage(input: {
  range: AdminUsageRange;
  userId?: string | null;
}): Promise<AdminUsageResponse> {
  const dateKeys = createDateKeys(input.range);
  const dateKeySet = new Set(dateKeys);
  const dailyMap = new Map<string, UsageBucket>(dateKeys.map((date) => [date, {
    date,
    platformUses: 0,
    images: 0,
    succeededJobs: 0,
    failedJobs: 0
  }]));
  const userMap = new Map<string, UserUsageBucket>();
  const modelMap = new Map<string, ModelUsageBucket>();
  const bounds = getRangeBounds(dateKeys);
  const userFilter = input.userId ? { userId: input.userId } : {};

  const [usageRows, images, jobs] = await Promise.all([
    prisma.usageDaily.findMany({
      where: {
        ...userFilter,
        date: {
          in: dateKeys
        }
      },
      include: {
        user: {
          select: {
            email: true
          }
        }
      }
    }),
    prisma.imageRecord.findMany({
      where: {
        ...userFilter,
        createdAt: {
          gte: bounds.start,
          lt: bounds.end
        }
      },
      include: {
        user: {
          select: {
            email: true
          }
        }
      }
    }),
    prisma.imageJob.findMany({
      where: {
        ...userFilter,
        createdAt: {
          gte: bounds.start,
          lt: bounds.end
        }
      },
      include: {
        user: {
          select: {
            email: true
          }
        }
      }
    })
  ]);

  for (const item of usageRows) {
    const daily = dailyMap.get(item.date);
    if (daily) {
      daily.platformUses += item.platformUses;
    }

    const user = ensureUserBucket(userMap, item.userId, item.user.email);
    user.platformUses += item.platformUses;
  }

  for (const image of images) {
    const date = getBeijingDateKey(image.createdAt);
    if (!dateKeySet.has(date)) continue;

    const daily = dailyMap.get(date);
    if (daily) {
      daily.images += 1;
    }

    const user = ensureUserBucket(userMap, image.userId, image.user.email);
    user.images += 1;
    ensureModelBucket(modelMap, image.provider, image.model).images += 1;
  }

  for (const job of jobs) {
    const date = getBeijingDateKey(job.createdAt);
    if (!dateKeySet.has(date)) continue;

    const daily = dailyMap.get(date);
    const user = ensureUserBucket(userMap, job.userId, job.user.email);
    const model = ensureModelBucket(modelMap, job.provider, job.model);
    model.jobs += 1;

    if (job.status === "succeeded") {
      if (daily) daily.succeededJobs += 1;
      user.succeededJobs += 1;
    }

    if (job.status === "failed") {
      if (daily) daily.failedJobs += 1;
      user.failedJobs += 1;
    }
  }

  return {
    range: input.range,
    daily: Array.from(dailyMap.values()),
    users: Array.from(userMap.values())
      .sort((left, right) => right.platformUses - left.platformUses || right.images - left.images || left.userEmail.localeCompare(right.userEmail))
      .slice(0, 20),
    models: Array.from(modelMap.values())
      .sort((left, right) => right.images - left.images || right.jobs - left.jobs || left.model.localeCompare(right.model))
      .slice(0, 20)
  };
}
