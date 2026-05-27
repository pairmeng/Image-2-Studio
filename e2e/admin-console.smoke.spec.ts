import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page, type Route } from "@playwright/test";

const adminUser = {
  id: "e2e-admin-console-admin",
  email: "admin-console@example.com",
  role: "ADMIN",
  disabled: false,
  jobMonitorClearedAt: null,
  jobMonitorFinishedClearedAt: null
};

const regularUser = {
  id: "e2e-admin-console-user",
  email: "admin-console-user@example.com",
  role: "USER",
  disabled: false,
  jobMonitorClearedAt: null,
  jobMonitorFinishedClearedAt: null
};

const adminImageId = "admin-image-smoke-1";
const imageSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480"><rect width="640" height="480" fill="#2177ff"/><circle cx="210" cy="180" r="92" fill="#34d399"/><path d="M0 360 C160 320 230 410 390 350 C500 312 570 330 640 296 L640 480 L0 480 Z" fill="#172033"/></svg>`;
const thumbSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240" viewBox="0 0 320 240"><rect width="320" height="240" fill="#2177ff"/><circle cx="110" cy="82" r="42" fill="#34d399"/></svg>`;

type PrismaClientInstance = import("@prisma/client").PrismaClient;

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body)
  });
}

function readEnvValue(name: string) {
  for (const file of [".env.local", ".env"]) {
    const fullPath = path.join(process.cwd(), file);
    if (!existsSync(fullPath)) continue;

    const line = readFileSync(fullPath, "utf8")
      .split(/\r?\n/)
      .find((item) => item.startsWith(`${name}=`));
    if (!line) continue;

    return line.slice(name.length + 1).replace(/^["']|["']$/g, "");
  }

  return undefined;
}

function getPlaywrightBaseUrl() {
  const port = process.env.PLAYWRIGHT_PORT ?? "3100";
  return process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;
}

function normalizePrismaDatabaseUrl(raw: string) {
  if (!raw.startsWith("file:")) return raw;

  const value = raw.slice("file:".length);
  const queryIndex = value.indexOf("?");
  const filePart = queryIndex >= 0 ? value.slice(0, queryIndex) : value;
  const query = queryIndex >= 0 ? value.slice(queryIndex) : "";

  if (path.isAbsolute(filePart)) return raw;

  return `file:${path.resolve(process.cwd(), "prisma", filePart)}${query}`;
}

async function getPrisma() {
  const databaseUrl = process.env.DATABASE_URL ?? readEnvValue("DATABASE_URL") ?? "file:./dev.db";
  process.env.DATABASE_URL = normalizePrismaDatabaseUrl(databaseUrl);
  const prismaPushArgs = ["exec", "prisma", "db", "push", "--schema", "prisma/schema.active.prisma", "--skip-generate"];
  const command = process.platform === "win32" ? "cmd.exe" : "pnpm";
  const args = process.platform === "win32" ? ["/c", "pnpm.cmd", ...prismaPushArgs] : prismaPushArgs;

  execFileSync(command, args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL
    },
    stdio: "ignore"
  });
  const { PrismaClient } = await import("@prisma/client");
  return new PrismaClient();
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

async function createSessionCookie(page: Page, prisma: PrismaClientInstance, user: typeof adminUser) {
  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  await prisma.user.upsert({
    where: {
      id: user.id
    },
    update: {
      email: user.email,
      role: user.role,
      disabled: user.disabled
    },
    create: {
      id: user.id,
      email: user.email,
      role: user.role,
      disabled: user.disabled,
      passwordHash: "not-used-in-session-smoke"
    }
  });

  await prisma.session.create({
    data: {
      id: `session-${user.id}-${Date.now()}`,
      userId: user.id,
      tokenHash: sha256(token),
      expiresAt
    }
  });

  await page.context().addCookies([{
    name: "image2_session",
    value: token,
    url: getPlaywrightBaseUrl(),
    httpOnly: true,
    sameSite: "Lax",
    expires: Math.floor(expiresAt.getTime() / 1000)
  }]);
}

async function cleanupTestUsers(prisma: PrismaClientInstance) {
  await prisma.session.deleteMany({
    where: {
      userId: {
        in: [adminUser.id, regularUser.id]
      }
    }
  });
  await prisma.user.deleteMany({
    where: {
      id: {
        in: [adminUser.id, regularUser.id]
      }
    }
  });
}

function buildJobQueue() {
  return {
    workerId: "worker-smoke",
    backend: "inline",
    configSource: "database",
    configVersion: "queue-smoke-v1",
    queueRuntimeVersion: "queue-runtime-smoke",
    workerRuntimeVersion: "worker-runtime-smoke",
    queue: {
      enabled: false,
      ok: true,
      target: "inline"
    },
    bullmq: {
      waiting: 0,
      active: 0,
      delayed: 0,
      failed: 0,
      completed: 0
    },
    redisTarget: "redis://cache.internal:6379/0",
    redisConfigured: true,
    queuePrefix: "image2",
    attempts: 3,
    backoffMs: 5000,
    concurrency: 2,
    userConcurrency: 1,
    workerConcurrency: 8,
    active: 0,
    queued: 1,
    pending: 1,
    running: 0,
    recentFailed: 1,
    recentSucceeded: 4,
    recent: {
      inspected: 5,
      averageQueueWaitMs: 120,
      averageExecutionMs: 2300,
      averageUpstreamMs: 1800,
      averageFileSaveMs: 90
    },
    providerHealth: [{
      provider: "openai",
      status: "degraded",
      total: 5,
      succeeded: 4,
      failed: 1,
      failureRate: 20,
      averageExecutionMs: 2300,
      averageUpstreamMs: 1800
    }],
    modelUsage: [{
      provider: "openai",
      model: "gpt-image-2",
      total: 5,
      succeeded: 4,
      failed: 1,
      averageExecutionMs: 2300
    }],
    failureReasons: [{
      reason: "Quota / rate limit",
      count: 1,
      sample: "429 rate limited",
      latestAt: "2026-05-27T08:00:00.000Z"
    }]
  };
}

function buildOverview() {
  return {
    totals: {
      users: 2,
      disabledUsers: 0,
      images: 7,
      jobs: 9
    },
    today: {
      platformUses: 3,
      generatedImages: 2,
      failedJobs: 1
    },
    settings: {
      registrationOpen: true,
      dailyPlatformQuota: 20,
      siteTitle: "Image-2 Studio",
      faviconUrl: "",
      logoUrl: "",
      imageQueueMode: "inline",
      imageQueueConfigSource: "database",
      imageQueueConfigVersion: "queue-smoke-v1",
      imageQueueRuntimeVersion: "queue-runtime-smoke",
      imageWorkerRuntimeVersion: "worker-runtime-smoke",
      imageQueueRedisConfigured: true,
      imageQueueRedisTarget: "redis://cache.internal:6379/0",
      imageJobConcurrency: 2,
      imageJobUserConcurrency: 1,
      imageQueuePrefix: "image2",
      imageWorkerConcurrency: 8,
      imageQueueAttempts: 3,
      imageQueueBackoffMs: 5000
    },
    platformProvider: {
      keys: {
        openai: {
          configured: true
        }
      },
      baseUrls: {
        openai: "https://api.example.com/v1"
      },
      models: {
        openai: "gpt-image-2"
      }
    },
    jobQueue: buildJobQueue(),
    users: [adminUser, regularUser],
    images: [{
      id: adminImageId,
      userEmail: regularUser.email,
      provider: "openai",
      model: "gpt-image-2",
      prompt: "Admin console smoke image",
      createdAt: "2026-05-27T08:00:00.000Z"
    }],
    usage: [{
      id: "usage-smoke-1",
      userEmail: regularUser.email,
      date: "2026-05-27",
      platformUses: 3
    }]
  };
}

async function mockAdminApi(page: Page) {
  let overview = buildOverview();
  let settingsSaved = false;
  let settingsRequestBody: Record<string, unknown> | null = null;

  await page.route((url) => url.pathname === "/api/admin/overview", (route) => fulfillJson(route, overview));
  await page.route((url) => url.pathname === "/api/admin/settings", async (route) => {
    settingsSaved = true;
    const body = JSON.parse(route.request().postData() || "{}") as typeof overview.settings & {
      imageQueueRedisUrl?: string;
      clearImageQueueRedisUrl?: boolean;
    };
    settingsRequestBody = body;
    const {
      imageQueueRedisUrl: _redisUrl,
      clearImageQueueRedisUrl: _clearRedisUrl,
      ...publicSettings
    } = body;
    overview = {
      ...overview,
      settings: {
        ...publicSettings,
        imageQueueRedisConfigured: body.clearImageQueueRedisUrl ? false : Boolean(body.imageQueueRedisUrl || publicSettings.imageQueueRedisConfigured),
        imageQueueRedisTarget: body.clearImageQueueRedisUrl ? "disabled" : (body.imageQueueRedisUrl ? "redis://cache.internal:6380/2" : publicSettings.imageQueueRedisTarget),
        imageQueueConfigSource: "database",
        imageQueueConfigVersion: "queue-smoke-v2"
      },
      jobQueue: {
        ...overview.jobQueue,
        backend: publicSettings.imageQueueMode,
        configSource: "database",
        configVersion: "queue-smoke-v2",
        redisConfigured: body.clearImageQueueRedisUrl ? false : Boolean(body.imageQueueRedisUrl || publicSettings.imageQueueRedisConfigured),
        redisTarget: body.clearImageQueueRedisUrl ? "disabled" : (body.imageQueueRedisUrl ? "redis://cache.internal:6380/2" : publicSettings.imageQueueRedisTarget),
        queuePrefix: publicSettings.imageQueuePrefix,
        attempts: publicSettings.imageQueueAttempts,
        backoffMs: publicSettings.imageQueueBackoffMs,
        concurrency: publicSettings.imageQueueMode === "redis" ? publicSettings.imageWorkerConcurrency : publicSettings.imageJobConcurrency,
        userConcurrency: publicSettings.imageQueueMode === "redis" ? publicSettings.imageWorkerConcurrency : publicSettings.imageJobUserConcurrency,
        workerConcurrency: publicSettings.imageWorkerConcurrency
      }
    };
    return fulfillJson(route, { settings: overview.settings });
  });
  await page.route((url) => url.pathname === "/api/admin/provider", (route) => fulfillJson(route, { ok: true }));
  await page.route((url) => url.pathname === "/api/admin/usage", (route) => fulfillJson(route, {
    range: route.request().url().includes("range=30d") ? "30d" : "7d",
    daily: [
      { date: "2026-05-21", platformUses: 0, images: 0, succeededJobs: 0, failedJobs: 0 },
      { date: "2026-05-22", platformUses: 1, images: 1, succeededJobs: 1, failedJobs: 0 },
      { date: "2026-05-23", platformUses: 2, images: 1, succeededJobs: 1, failedJobs: 1 },
      { date: "2026-05-24", platformUses: 0, images: 0, succeededJobs: 0, failedJobs: 0 },
      { date: "2026-05-25", platformUses: 3, images: 2, succeededJobs: 2, failedJobs: 0 },
      { date: "2026-05-26", platformUses: 1, images: 1, succeededJobs: 1, failedJobs: 0 },
      { date: "2026-05-27", platformUses: 3, images: 2, succeededJobs: 2, failedJobs: 1 }
    ],
    users: [{
      userId: regularUser.id,
      userEmail: regularUser.email,
      platformUses: 10,
      images: 7,
      succeededJobs: 6,
      failedJobs: 1
    }],
    models: [{
      provider: "openai",
      model: "gpt-image-2",
      images: 7,
      jobs: 9
    }]
  }));
  await page.route((url) => url.pathname === "/api/admin/monitor", (route) => fulfillJson(route, {
    jobQueue: buildJobQueue(),
    recentJobs: [{
      id: "job-smoke-1",
      userEmail: regularUser.email,
      status: "failed",
      provider: "openai",
      model: "gpt-image-2",
      prompt: "Admin console smoke image",
      queueWaitMs: 120,
      executionMs: 2300,
      upstreamMs: 1800,
      fileSaveMs: 90,
      error: "429 rate limited",
      createdAt: "2026-05-27T08:00:00.000Z",
      startedAt: "2026-05-27T08:00:01.000Z",
      finishedAt: "2026-05-27T08:00:04.000Z"
    }]
  }));
  await page.route((url) => url.pathname === "/api/admin/images", (route) => fulfillJson(route, {
    records: [{
      id: adminImageId,
      userId: regularUser.id,
      userEmail: regularUser.email,
      createdAt: "2026-05-27T08:00:00.000Z",
      provider: "openai",
      model: "gpt-image-2",
      mode: "text_to_image",
      prompt: "Admin console smoke image",
      imageUrl: `/api/admin/images/file/${adminImageId}`,
      thumbnailUrl: `/api/admin/images/thumb/${adminImageId}`,
      imagePath: "admin-image-smoke.svg",
      size: "1024x1024",
      aspectRatio: "1:1",
      quality: "medium",
      inputFidelity: "high",
      tags: ["smoke"]
    }],
    nextCursor: undefined
  }));
  await page.route((url) => url.pathname === "/api/admin/audit-logs", (route) => fulfillJson(route, {
    records: [{
      id: "audit-smoke-1",
      adminUserId: adminUser.id,
      action: "settings.update",
      targetType: "app-settings",
      targetId: "app-setting-1",
      metadata: {
        queueMode: "redis",
        openaiKeyConfigured: true,
        redisTarget: "redis://cache.internal:6379/0"
      },
      ipAddress: "127.0.0.1",
      userAgent: "playwright",
      createdAt: "2026-05-27T08:00:00.000Z"
    }],
    nextCursor: undefined
  }));
  await page.route((url) => url.pathname === `/api/admin/images/thumb/${adminImageId}`, (route) => route.fulfill({
    status: 200,
    contentType: "image/svg+xml",
    body: thumbSvg
  }));
  await page.route((url) => url.pathname === `/api/admin/images/file/${adminImageId}`, (route) => route.fulfill({
    status: 200,
    contentType: "image/svg+xml",
    body: imageSvg
  }));

  return {
    wasSettingsSaved: () => settingsSaved,
    getSettingsRequestBody: () => settingsRequestBody
  };
}

async function mockHomeApi(page: Page) {
  await page.route((url) => url.pathname === "/api/app/branding", (route) => fulfillJson(route, {
    siteTitle: "Image-2 Studio",
    faviconUrl: "",
    logoUrl: ""
  }));
  await page.route((url) => url.pathname === "/api/auth/me", (route) => fulfillJson(route, {
    user: regularUser,
    registrationOpen: true
  }));
  await page.route((url) => url.pathname.startsWith("/api/images/"), (route) => fulfillJson(route, {
    records: [],
    batches: [],
    projects: [],
    templates: [],
    jobs: [],
    providers: [],
    models: []
  }));
}

async function expectNoPageOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    bodyClientWidth: document.body.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
    docClientWidth: document.documentElement.clientWidth,
    docScrollWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth
  }));

  expect(overflow.docScrollWidth).toBeLessThanOrEqual(overflow.docClientWidth + 1);
  expect(overflow.bodyScrollWidth).toBeLessThanOrEqual(overflow.viewportWidth + 1);
}

test("admin user can use the v1 console modules", async ({ page }) => {
  const prisma = await getPrisma();
  await cleanupTestUsers(prisma);
  await createSessionCookie(page, prisma, adminUser);
  const adminApi = await mockAdminApi(page);

  await page.goto("/admin");

  await expect(page.getByTestId("admin-overview")).toBeVisible();
  await expect(page.getByText("用户总数")).toBeVisible();
  await expect(page.getByText("Image-2 管理台")).toBeVisible();

  await page.getByRole("button", { name: /平台设置/ }).click();
  await expect(page.getByTestId("admin-settings")).toBeVisible();
  await page.getByLabel("站点标题").fill("Image-2 Console");
  await page.getByRole("button", { name: "保存设置" }).click();
  await expect.poll(adminApi.wasSettingsSaved).toBe(true);

  await page.getByRole("group", { name: "队列模式" }).getByRole("button", { name: "Redis 队列" }).click();
  await page.getByLabel("总并发").fill("4");
  await page.getByLabel("单用户并发").fill("2");
  await page.getByRole("textbox", { name: "Redis URL" }).fill("redis://:secret@cache.internal:6380/2");
  await page.getByLabel("队列前缀").fill("image2-prod");
  await page.getByLabel("Worker 并发").fill("12");
  await page.getByLabel("重试次数").fill("5");
  await page.getByLabel("退避时间 ms").fill("7000");
  await page.getByRole("button", { name: "保存队列" }).click();
  await expect.poll(() => adminApi.getSettingsRequestBody()?.imageQueueMode).toBe("redis");
  await expect.poll(() => adminApi.getSettingsRequestBody()?.imageQueueRedisUrl).toBe("redis://:secret@cache.internal:6380/2");
  await expect(page.getByText("redis://:secret@cache.internal:6380/2")).toHaveCount(0);
  await expect(page.getByText("redis://cache.internal:6380/2")).toBeVisible();

  await page.getByRole("button", { name: /用户管理/ }).click();
  await expect(page.getByTestId("admin-users")).toBeVisible();
  await expect(page.getByText(regularUser.email)).toBeVisible();

  await page.getByRole("button", { name: /用量统计/ }).click();
  await expect(page.getByTestId("admin-usage")).toBeVisible();
  await expect(page.getByText("模型分布")).toBeVisible();

  await page.getByRole("button", { name: /平台监控/ }).click();
  await expect(page.getByTestId("admin-monitor")).toBeVisible();
  await expect(page.getByText("Quota / rate limit")).toBeVisible();
  await expect(page.getByText("当前队列配置")).toBeVisible();

  await page.getByRole("button", { name: /图片审查/ }).click();
  await expect(page.getByTestId("admin-images")).toBeVisible();
  await page.locator(".admin-image-card").first().click();
  const previewDialog = page.getByRole("dialog", { name: "图片预览" });
  await expect(previewDialog).toBeVisible();
  await expect(page.getByText("Admin console smoke image")).toBeVisible();
  await previewDialog.getByRole("button", { name: "关闭" }).click();
  await expect(previewDialog).toBeHidden();

  await page.getByRole("button", { name: /审计日志/ }).click();
  await expect(page.getByTestId("admin-audit")).toBeVisible();
  await expect(page.getByText("settings.update")).toBeVisible();
  await expect(page.getByText("redis://cache.internal:6379/0")).toBeVisible();

  await prisma.$disconnect();
});

test("admin console v2 layout keeps hierarchy and mobile width stable", async ({ page }) => {
  const prisma = await getPrisma();
  await cleanupTestUsers(prisma);
  await createSessionCookie(page, prisma, adminUser);
  await mockAdminApi(page);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/admin");
  await expect(page.locator(".admin-console-page-overview")).toBeVisible();
  await expect(page.locator(".admin-overview-metrics .admin-metric-card")).toHaveCount(6);
  await expect(page.locator(".admin-overview-metrics .admin-metric-card").first()).toBeVisible();
  await expectNoPageOverflow(page);

  await page.getByRole("button", { name: /平台监控/ }).click();
  await expect(page.locator(".admin-console-page-monitor")).toBeVisible();
  await expect(page.locator(".admin-monitor-hero")).toBeVisible();
  await expect(page.locator(".admin-monitor-insight-grid")).toBeVisible();
  await expectNoPageOverflow(page);

  await page.getByRole("button", { name: /用量统计/ }).click();
  await expect(page.locator(".admin-segmented-control")).toBeVisible();
  await page.getByRole("button", { name: "近 30 天" }).click();
  await expect(page.getByRole("button", { name: "近 30 天" })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: /图片审查/ }).click();
  await expect(page.locator(".admin-review-grid")).toBeVisible();
  await expectNoPageOverflow(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByTestId("admin-overview")).toBeVisible();
  await expectNoPageOverflow(page);
  await page.getByRole("button", { name: /平台监控/ }).click();
  await expect(page.locator(".admin-monitor-flow-card")).toHaveCount(4);
  await expectNoPageOverflow(page);
  await page.getByRole("button", { name: /图片审查/ }).click();
  await expect(page.locator(".admin-review-grid")).toBeVisible();
  await expectNoPageOverflow(page);

  await prisma.$disconnect();
});

test("non-admin user cannot render the admin console", async ({ page }) => {
  const prisma = await getPrisma();
  await cleanupTestUsers(prisma);
  await createSessionCookie(page, prisma, regularUser);
  await mockHomeApi(page);

  await page.goto("/admin");

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("admin-overview")).toBeHidden();

  await prisma.$disconnect();
});
