import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import sharp from "sharp";
import { AppError } from "../src/lib/server/errors";
import { assertStorageFilePath, validateUploadedImageBuffer } from "../src/lib/server/files";
import { assertProductionConfiguration } from "../src/lib/server/production-guardrails";
import {
  assertRateLimit,
  assertSameOrigin,
  readLimitedJsonBody,
  resetRateLimitsForTests
} from "../src/lib/server/security";
import { sanitizeAdminAuditMetadata } from "../src/lib/server/admin-audit";

function makeRequest(url: string, init: RequestInit = {}) {
  return new Request(url, init);
}

describe("server security helpers", () => {
  it("accepts same-origin mutating requests and rejects cross-origin requests", () => {
    assert.doesNotThrow(() => assertSameOrigin(makeRequest("https://app.example.com/api/test", {
      headers: { origin: "https://app.example.com" }
    })));
    assert.doesNotThrow(() => assertSameOrigin(makeRequest("http://app.example.com/api/test", {
      headers: {
        origin: "https://app.example.com",
        "x-forwarded-proto": "https"
      }
    })));

    assert.throws(
      () => assertSameOrigin(makeRequest("https://app.example.com/api/test", {
        headers: { origin: "https://evil.example.com" }
      })),
      (error) => error instanceof AppError && error.status === 403
    );
  });

  it("limits JSON body size before parsing", async () => {
    const small = await readLimitedJsonBody<{ ok?: boolean }>(
      makeRequest("https://app.example.com/api/test", {
        method: "POST",
        body: JSON.stringify({ ok: true })
      }),
      64
    );
    assert.equal(small.ok, true);

    await assert.rejects(
      readLimitedJsonBody(makeRequest("https://app.example.com/api/test", {
        method: "POST",
        body: JSON.stringify({ value: "x".repeat(100) })
      }), 16),
      (error) => error instanceof AppError && error.status === 413
    );
  });

  it("isolates rate limits by scope and key", async () => {
    resetRateLimitsForTests();
    await assertRateLimit("login", "ip-a:user-a", { limit: 2, windowMs: 60_000 });
    await assertRateLimit("login", "ip-a:user-a", { limit: 2, windowMs: 60_000 });
    await assertRateLimit("login", "ip-a:user-b", { limit: 2, windowMs: 60_000 });

    await assert.rejects(
      assertRateLimit("login", "ip-a:user-a", { limit: 2, windowMs: 60_000 }),
      (error) => error instanceof AppError && error.status === 429
    );
  });

  it("redacts sensitive admin audit metadata", () => {
    const metadata = sanitizeAdminAuditMetadata({
      openaiKey: "sk-live-secret",
      openaiKeyConfigured: true,
      apiKeyUpdated: true,
      redisUrl: "redis://:secret@localhost:6379/0",
      passwordLength: 14,
      redisTarget: "redis://localhost:6379/0"
    });

    assert.equal(metadata.openaiKey, "[redacted]");
    assert.equal(metadata.openaiKeyConfigured, true);
    assert.equal(metadata.apiKeyUpdated, true);
    assert.equal(metadata.redisUrl, "[redacted]");
    assert.equal(metadata.passwordLength, 14);
    assert.equal(metadata.redisTarget, "redis://localhost:6379/0");
    assert.equal(JSON.stringify(metadata).includes("sk-live-secret"), false);
  });

  it("rejects weak production secrets", () => {
    assert.throws(
      () => assertProductionConfiguration({
        NODE_ENV: "production",
        APP_SECRET: "replace-with-at-least-32-random-characters",
        DATABASE_URL: "postgresql://image2:change-me@postgres:5432/image2?schema=public",
        POSTGRES_PASSWORD: "change-me"
      } as NodeJS.ProcessEnv),
      (error) => error instanceof AppError && error.status === 500
    );

    assert.doesNotThrow(() => assertProductionConfiguration({
      NODE_ENV: "production",
      APP_SECRET: "0123456789abcdef0123456789abcdef",
      DATABASE_URL: "postgresql://image2:strong-postgres-password@postgres:5432/image2?schema=public",
      POSTGRES_PASSWORD: "strong-postgres-password",
      INITIAL_ADMIN_PASSWORD: "strong-admin-password",
      AUTH_COOKIE_SECURE: "true"
    } as NodeJS.ProcessEnv));
    assert.doesNotThrow(() => assertProductionConfiguration({
      NODE_ENV: "production",
      APP_SECRET: "0123456789abcdef0123456789abcdef",
      DATABASE_URL: "postgresql://db_user:db_password@db.example.com:5432/image2?schema=public",
      POSTGRES_PASSWORD: "change-me",
      AUTH_COOKIE_SECURE: "true"
    } as NodeJS.ProcessEnv));
  });

  it("validates upload magic bytes and storage path boundaries", async () => {
    const png = await sharp({
      create: {
        width: 1,
        height: 1,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      }
    }).png().toBuffer();

    assert.equal(await validateUploadedImageBuffer(png, "image/png"), "image/png");
    await assert.rejects(
      validateUploadedImageBuffer(Buffer.from("not an image"), "image/png"),
      (error) => error instanceof AppError
    );

    const storagePath = path.join(process.cwd(), "storage", "generated", "user-1", "image.png");
    assert.equal(assertStorageFilePath(storagePath, ["generated"]), path.resolve(storagePath));
    assert.throws(
      () => assertStorageFilePath(path.join(process.cwd(), "package.json"), ["generated"]),
      (error) => error instanceof AppError && error.status === 403
    );
  });
});
