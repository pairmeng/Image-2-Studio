import { expect, test, type Page, type Route } from "@playwright/test";

const user = {
  id: "user-mobile-1",
  email: "mobile@example.com",
  role: "USER",
  disabled: false,
  jobMonitorClearedAt: null,
  jobMonitorFinishedClearedAt: null
};

const pendingJobId = "job-mobile-pending";
const mobileBatchId = "batch-mobile-1";
const createdAt = "2026-05-25T12:00:00.000Z";

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body)
  });
}

function buildJob(status: "pending" | "paused" | "running" | "failed" | "succeeded") {
  return {
    id: pendingJobId,
    status,
    provider: "openai",
    model: "gpt-image-2",
    mode: "text-to-image",
    prompt: "Mobile workflow smoke image",
    createdAt,
    ...(status === "running" || status === "succeeded" ? { startedAt: createdAt } : {}),
    ...(status === "succeeded" ? { resultId: "image-mobile-1", imageUrl: "/generated/mobile.png", finishedAt: createdAt } : {}),
    ...(status === "failed" ? { error: "Provider rejected the request.", finishedAt: createdAt } : {})
  };
}

function buildBatch(status: "running" | "partial" = "running") {
  const thirdItemStatus = status === "running" ? "pending" : "succeeded";
  const items = [
    {
      id: "batch-mobile-item-1",
      batchId: mobileBatchId,
      index: 0,
      provider: "openai",
      model: "gpt-image-2",
      mode: "text-to-image",
      prompt: "Mobile batch image one with a long prompt that should wrap without pushing actions outside the viewport.",
      status: "succeeded",
      jobId: "job-mobile-batch-1",
      resultId: "image-mobile-batch-1",
      imageUrl: "/generated/mobile-batch-1.png",
      thumbnailUrl: "/generated/mobile-batch-1-thumb.png",
      retryCount: 0,
      createdAt,
      startedAt: createdAt,
      finishedAt: createdAt
    },
    {
      id: "batch-mobile-item-2",
      batchId: mobileBatchId,
      index: 1,
      provider: "openai",
      model: "gpt-image-2",
      mode: "text-to-image",
      prompt: "Mobile batch image two failed prompt.",
      status: "failed",
      jobId: "job-mobile-batch-2",
      error: "Provider rejected the request after queueing.",
      retryCount: 1,
      createdAt,
      startedAt: createdAt,
      finishedAt: createdAt
    },
    {
      id: "batch-mobile-item-3",
      batchId: mobileBatchId,
      index: 2,
      provider: "openai",
      model: "gpt-image-2",
      mode: "text-to-image",
      prompt: "Mobile batch image three still pending.",
      status: thirdItemStatus,
      jobId: "job-mobile-batch-3",
      ...(thirdItemStatus === "succeeded" ? {
        resultId: "image-mobile-batch-3",
        imageUrl: "/generated/mobile-batch-3.png",
        thumbnailUrl: "/generated/mobile-batch-3-thumb.png",
        startedAt: createdAt,
        finishedAt: createdAt
      } : {}),
      retryCount: 0,
      createdAt
    }
  ] as const;

  return {
    id: mobileBatchId,
    name: "Mobile batch smoke",
    provider: "openai",
    model: "gpt-image-2",
    mode: "text-to-image",
    status,
    totalCount: items.length,
    successCount: status === "running" ? 1 : 2,
    failedCount: 1,
    promptFormat: "blocks",
    createdAt,
    updatedAt: createdAt,
    items
  };
}

async function mockMobileWorkflowApi(page: Page) {
  let loggedIn = false;
  let currentUser = { ...user };
  let jobStatus: "pending" | "paused" | "running" | "failed" | "succeeded" = "pending";
  let batchDetailRequests = 0;

  await page.route((url) => url.pathname === "/api/app/branding", (route) => fulfillJson(route, {
    siteTitle: "Image-2 Studio",
    faviconUrl: "",
    logoUrl: ""
  }));

  await page.route((url) => url.pathname === "/api/auth/me", (route) => fulfillJson(route, {
    user: loggedIn ? currentUser : null,
    registrationOpen: true
  }));

  await page.route((url) => url.pathname === "/api/auth/login", (route) => {
    loggedIn = true;
    return fulfillJson(route, { user: currentUser });
  });

  await page.route((url) => url.pathname === "/api/auth/password", (route) => {
    currentUser = {
      ...currentUser,
      jobMonitorClearedAt: "2026-05-25T12:01:00.000Z"
    };
    return fulfillJson(route, { user: currentUser });
  });

  await page.route((url) => url.pathname === "/api/images/catalog", (route) => fulfillJson(route, {
    providers: [{
      provider: "openai",
      label: "OpenAI",
      configured: true,
      supportsCustomSize: false,
      baseUrlConfigured: false
    }],
    models: [{
      provider: "openai",
      modelId: "gpt-image-2",
      label: "GPT Image 2",
      description: "Mobile smoke-test model",
      capabilities: ["text-to-image", "image-to-image", "continue-edit"],
      defaultSize: "1024x1024",
      supportedSizes: ["1024x1024"],
      defaultAspectRatio: "1:1",
      supportedAspectRatios: ["1:1", "3:4", "4:3"],
      defaultQuality: "medium",
      qualityOptions: ["low", "medium", "high"],
      inputFidelityOptions: ["high", "low"],
      supportsCustomSize: false
    }]
  }));

  await page.route((url) => url.pathname === "/api/images/history", (route) => fulfillJson(route, {
    records: [],
    nextCursor: undefined
  }));

  await page.route((url) => url.pathname === "/api/images/batches", (route) => fulfillJson(route, { batches: [] }));
  await page.route((url) => url.pathname === "/api/images/batches/start", (route) => fulfillJson(route, buildBatch()));
  await page.route((url) => url.pathname === `/api/images/batches/${mobileBatchId}`, (route) => {
    batchDetailRequests += 1;
    return fulfillJson(route, buildBatch(batchDetailRequests === 1 ? "running" : "partial"));
  });
  await page.route((url) => url.pathname === "/api/images/projects", (route) => fulfillJson(route, { projects: [] }));
  await page.route((url) => url.pathname === "/api/images/templates", (route) => fulfillJson(route, { templates: [] }));
  await page.route((url) => url.pathname === "/api/settings/provider", (route) => fulfillJson(route, {
    activeProvider: "openai",
    keys: {
      openai: { configured: true, source: "user" }
    },
    baseUrls: {},
    models: {}
  }));

  await page.route((url) => url.pathname === "/api/images/jobs", (route) => fulfillJson(route, {
    jobs: [buildJob(jobStatus)]
  }));

  await page.route((url) => url.pathname === `/api/images/jobs/${pendingJobId}/pause`, (route) => {
    jobStatus = "paused";
    return fulfillJson(route, buildJob(jobStatus));
  });

  await page.route((url) => url.pathname === "/generated/mobile-batch-1-thumb.png" || url.pathname === "/generated/mobile-batch-1.png", (route) => route.fulfill({
    status: 200,
    contentType: "image/png",
    body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lWngJQAAAABJRU5ErkJggg==", "base64")
  }));
}

test.use({ viewport: { width: 390, height: 844 } });

test("mobile account, batch panel, and job monitor controls stay operable", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

  await mockMobileWorkflowApi(page);
  await page.goto("/");

  await page.getByTestId("auth-email").fill(user.email);
  await page.getByTestId("auth-password").fill("correct horse battery staple");
  await page.getByTestId("auth-submit").click();

  await expect(page.getByTestId("open-generation-studio")).toBeVisible();

  await page.getByTestId("job-monitor-toggle").click();
  await expect(page.getByTestId("job-monitor-popover")).toBeVisible();
  await expect(page.getByTestId("job-monitor-row").first()).toHaveAttribute("data-job-status", "pending");
  await expect(page.getByTestId("job-monitor-track").first()).toBeEnabled();
  await page.getByTestId("job-monitor-pause").first().click();
  await expect(page.getByTestId("job-monitor-row").first()).toHaveAttribute("data-job-status", "paused");
  await expect(page.getByTestId("job-monitor-resume").first()).toBeVisible();

  await page.getByTestId("job-monitor-toggle").click();
  await page.getByTestId("topbar-more-button").click();
  await page.getByTestId("change-password-open").click();
  await expect(page.getByTestId("account-password-dialog")).toBeVisible();
  await page.getByTestId("account-current-password").fill("correct horse battery staple");
  await page.getByTestId("account-new-password").fill("new mobile password");
  await page.getByTestId("account-confirm-password").fill("new mobile password");
  await page.getByTestId("account-save-password").click();
  await expect(page.getByTestId("account-password-dialog")).toBeHidden();

  await page.getByTestId("open-generation-studio").click();
  await expect(page.getByTestId("input-mode-batch")).toBeVisible();
  await page.getByTestId("input-mode-batch").click();
  await expect(page.getByTestId("input-mode-batch")).toHaveClass(/is-active/);
  await page.getByTestId("prompt-input").fill("---PROMPT---\nMobile batch image one\n---END---\n\n---PROMPT---\nMobile batch image two\n---END---");
  await page.getByTestId("generate-submit").click();
  await expect(page.getByTestId("batch-result-stage")).toBeVisible();
  await expect(page.getByTestId("batch-result-item")).toHaveCount(3);
  await expect(page.getByTestId("batch-item-actions")).toHaveCount(3);

  const drawerToggle = page.getByTestId("composer-drawer-toggle");
  await expect(drawerToggle).toHaveAttribute("aria-expanded", "false");
  await drawerToggle.click();
  await expect(drawerToggle).toHaveAttribute("aria-expanded", "true");

  const layoutHealth = await page.evaluate(() => {
    const selectors = [
      ".topbar",
      ".control-panel",
      ".composer-drawer-toggle",
      ".batch-textarea",
      ".batch-result-stage",
      ".batch-result-item",
      ".batch-item-actions"
    ];
    const selectedElements = selectors.flatMap((selector) => Array.from(document.querySelectorAll<HTMLElement>(selector)));
    const visibleElements = selectedElements.filter((element) => element.offsetParent !== null);
    const allVisibleElementsFit = visibleElements.every((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 &&
        rect.left >= -1 &&
        rect.right <= window.innerWidth + 1 &&
        element.scrollWidth <= element.clientWidth + 2;
    });

    const textarea = document.querySelector<HTMLTextAreaElement>(".batch-textarea");
    const textareaStable = Boolean(textarea) &&
      textarea.clientHeight >= 180 &&
      textarea.clientHeight <= Math.round(window.innerHeight * 0.42) + 2 &&
      textarea.scrollHeight >= textarea.clientHeight;

    const actionButtonsFit = Array.from(document.querySelectorAll<HTMLElement>(".batch-item-actions > *")).every((element) => {
      const rect = element.getBoundingClientRect();
      const parentRect = element.parentElement?.getBoundingClientRect();
      return Boolean(parentRect) &&
        rect.left >= parentRect!.left - 1 &&
        rect.right <= parentRect!.right + 1 &&
        rect.right <= window.innerWidth + 1;
    });

    return allVisibleElementsFit && textareaStable && actionButtonsFit;
  });
  expect(layoutHealth).toBe(true);

  await page.getByTestId("job-monitor-toggle").click();
  await expect(page.getByTestId("job-monitor-popover")).toBeVisible();
  const popoverFits = await page.getByTestId("job-monitor-popover").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.left >= -1 &&
      rect.right <= window.innerWidth + 1 &&
      rect.top >= -1 &&
      rect.bottom <= window.innerHeight + 1 &&
      element.scrollWidth <= element.clientWidth + 2;
  });
  expect(popoverFits).toBe(true);
  expect(consoleErrors).toEqual([]);
});
