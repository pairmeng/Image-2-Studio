import { expect, test, type Page, type Route } from "@playwright/test";

const user = {
  id: "user-lightbox-1",
  email: "lightbox@example.com",
  role: "USER",
  disabled: false,
  jobMonitorClearedAt: null,
  jobMonitorFinishedClearedAt: null
};

const imageId = "image-lightbox-1";
const imageSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1672" height="941" viewBox="0 0 1672 941"><defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#f78dbb"/><stop offset="1" stop-color="#0d4ea6"/></linearGradient></defs><rect width="1672" height="941" fill="url(#g)"/><circle cx="526" cy="310" r="170" fill="#fff4" /><path d="M0 670 C300 590 520 735 820 660 C1130 582 1348 610 1672 520 L1672 941 L0 941 Z" fill="#001b46aa"/></svg>`;
const imageBytes = Buffer.byteLength(imageSvg);
const thumbSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><rect width="640" height="360" fill="#0d4ea6"/><circle cx="210" cy="120" r="72" fill="#f78dbb"/></svg>`;

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body)
  });
}

async function mockLightboxApi(page: Page) {
  let loggedIn = false;
  const requestCounts = {
    originalGet: 0,
    originalHead: 0,
    thumbGet: 0
  };

  await page.route((url) => url.pathname === "/api/app/branding", (route) => fulfillJson(route, {
    siteTitle: "Image-2 Studio",
    faviconUrl: "",
    logoUrl: ""
  }));

  await page.route((url) => url.pathname === "/api/auth/me", (route) => fulfillJson(route, {
    user: loggedIn ? user : null,
    registrationOpen: true
  }));

  await page.route((url) => url.pathname === "/api/auth/login", (route) => {
    loggedIn = true;
    return fulfillJson(route, { user });
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
      description: "Lightbox smoke-test model",
      capabilities: ["text-to-image", "image-to-image", "continue-edit"],
      defaultSize: "1536x1024",
      supportedSizes: ["1024x1024", "1536x1024", "1024x1536"],
      defaultAspectRatio: "16:9",
      supportedAspectRatios: ["1:1", "16:9", "4:3"],
      defaultQuality: "medium",
      qualityOptions: ["low", "medium", "high"],
      inputFidelityOptions: ["high", "low"],
      supportsCustomSize: false
    }]
  }));

  await page.route((url) => url.pathname === "/api/images/history", (route) => fulfillJson(route, {
    records: [{
      id: imageId,
      createdAt: "2026-05-24T12:00:00.000Z",
      provider: "openai",
      model: "gpt-image-2",
      mode: "text-to-image",
      prompt: "Lightbox zoom smoke test image",
      imageUrl: `/api/images/file/${imageId}`,
      thumbnailUrl: `/api/images/thumb/${imageId}`,
      imagePath: "storage/images/lightbox.svg",
      size: "1536x1024",
      aspectRatio: "16:9",
      quality: "medium",
      sourceImageIds: [],
      uploadUrls: [],
      tags: []
    }],
    nextCursor: undefined
  }));

  await page.route((url) => url.pathname === "/api/images/batches", (route) => fulfillJson(route, { batches: [] }));
  await page.route((url) => url.pathname === "/api/images/projects", (route) => fulfillJson(route, { projects: [] }));
  await page.route((url) => url.pathname === "/api/images/templates", (route) => fulfillJson(route, { templates: [] }));
  await page.route((url) => url.pathname === "/api/images/jobs", (route) => fulfillJson(route, { jobs: [] }));

  await page.route((url) => url.pathname === `/api/images/thumb/${imageId}`, (route) => {
    requestCounts.thumbGet += 1;
    return route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: thumbSvg
    });
  });

  await page.route((url) => url.pathname === `/api/images/file/${imageId}`, (route) => {
    if (route.request().method() === "HEAD") {
      requestCounts.originalHead += 1;
      return route.fulfill({
        status: 200,
        headers: {
          "content-type": "image/svg+xml",
          "content-length": String(imageBytes)
        }
      });
    }

    requestCounts.originalGet += 1;
    return route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: imageSvg
    });
  });

  return requestCounts;
}

test("gallery image opens a second-level zoomable inspector", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

  const requestCounts = await mockLightboxApi(page);
  await page.goto("/");

  await page.getByTestId("auth-email").fill(user.email);
  await page.getByTestId("auth-password").fill("correct horse battery staple");
  await page.getByTestId("auth-submit").click();

  await expect(page.getByTestId("history-card-preview")).toBeVisible();
  await expect.poll(() => requestCounts.thumbGet).toBeGreaterThan(0);
  expect(requestCounts.originalGet).toBe(0);

  await page.getByTestId("history-card-preview").click();

  await expect(page.getByTestId("lightbox-detail")).toBeVisible();
  await expect.poll(() => requestCounts.originalGet).toBeGreaterThan(0);
  await page.getByTestId("lightbox-detail-image").click();

  await expect(page.getByTestId("lightbox-inspector")).toBeVisible();
  await expect(page.getByTestId("lightbox-zoom-label")).toHaveText("100%");
  await expect(page.getByTestId("lightbox-download")).toHaveAttribute("href", `/api/images/file/${imageId}`);

  await page.getByTestId("lightbox-inspector-stage").hover();
  await page.mouse.wheel(0, -600);
  await expect(page.getByTestId("lightbox-zoom-label")).toHaveText("112%");
  await expect(page.getByTestId("lightbox-inspector-image")).toHaveCSS("transform", /matrix/);

  await page.getByTestId("lightbox-reset-zoom").click();
  await expect(page.getByTestId("lightbox-zoom-label")).toHaveText("100%");

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("lightbox-detail")).toBeVisible();
  await expect(page.getByTestId("lightbox-inspector")).toBeHidden();

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("lightbox-detail")).toBeHidden();
  expect(consoleErrors).toEqual([]);
});
