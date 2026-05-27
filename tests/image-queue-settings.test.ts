import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_IMAGE_JOB_CONCURRENCY,
  DEFAULT_IMAGE_QUEUE_ATTEMPTS,
  DEFAULT_IMAGE_QUEUE_BACKOFF_MS,
  DEFAULT_IMAGE_QUEUE_PREFIX,
  DEFAULT_IMAGE_WORKER_CONCURRENCY,
  getImageQueueSettingsUpdate,
  getPublicImageQueueSettingsFromRecord,
  getRedisTarget,
  resolveImageQueueSettings,
  sanitizeImageQueuePrefix,
  sanitizeRedisUrl,
  toPublicImageQueueSettings
} from "../src/lib/server/image-queue-settings";

process.env.APP_SECRET = "test-secret-for-image-queue-settings-1234567890";

describe("image queue settings", () => {
  it("uses safe defaults when neither database nor env provides queue settings", () => {
    const settings = resolveImageQueueSettings(null, {});

    assert.equal(settings.mode, "inline");
    assert.equal(settings.source, "default");
    assert.equal(settings.redisConfigured, false);
    assert.equal(settings.redisTarget, "disabled");
    assert.equal(settings.imageJobConcurrency, DEFAULT_IMAGE_JOB_CONCURRENCY);
    assert.equal(settings.imageJobUserConcurrency, 1);
    assert.equal(settings.imageQueuePrefix, DEFAULT_IMAGE_QUEUE_PREFIX);
    assert.equal(settings.imageWorkerConcurrency, DEFAULT_IMAGE_WORKER_CONCURRENCY);
    assert.equal(settings.imageQueueAttempts, DEFAULT_IMAGE_QUEUE_ATTEMPTS);
    assert.equal(settings.imageQueueBackoffMs, DEFAULT_IMAGE_QUEUE_BACKOFF_MS);
  });

  it("uses env fallback when database values are not present", () => {
    const settings = resolveImageQueueSettings(null, {
      REDIS_URL: "rediss://:secret@redis.example.com:6380/2",
      IMAGE_QUEUE_PREFIX: "image2-prod",
      IMAGE_JOB_CONCURRENCY: "7",
      IMAGE_JOB_USER_CONCURRENCY: "3",
      IMAGE_WORKER_CONCURRENCY: "24",
      IMAGE_QUEUE_ATTEMPTS: "9",
      IMAGE_QUEUE_BACKOFF_MS: "12000"
    });

    assert.equal(settings.mode, "redis");
    assert.equal(settings.source, "env");
    assert.equal(settings.redisConfigured, true);
    assert.equal(settings.redisTarget, "rediss://redis.example.com:6380/2");
    assert.equal(settings.imageJobConcurrency, 7);
    assert.equal(settings.imageJobUserConcurrency, 3);
    assert.equal(settings.imageQueuePrefix, "image2-prod");
    assert.equal(settings.imageWorkerConcurrency, 24);
    assert.equal(settings.imageQueueAttempts, 9);
    assert.equal(settings.imageQueueBackoffMs, 12000);
  });

  it("lets database values override env and clamps numeric ranges", () => {
    const settings = resolveImageQueueSettings({
      imageQueueMode: "inline",
      imageJobConcurrency: 99,
      imageJobUserConcurrency: 99,
      imageQueuePrefix: "db-prefix",
      imageWorkerConcurrency: 999,
      imageQueueAttempts: 999,
      imageQueueBackoffMs: 9999999
    }, {
      REDIS_URL: "redis://env.example.com:6379/0",
      IMAGE_QUEUE_PREFIX: "env-prefix",
      IMAGE_JOB_CONCURRENCY: "3",
      IMAGE_JOB_USER_CONCURRENCY: "2",
      IMAGE_WORKER_CONCURRENCY: "4",
      IMAGE_QUEUE_ATTEMPTS: "5",
      IMAGE_QUEUE_BACKOFF_MS: "6000"
    });

    assert.equal(settings.mode, "inline");
    assert.equal(settings.source, "mixed");
    assert.equal(settings.redisTarget, "redis://env.example.com:6379/0");
    assert.equal(settings.imageJobConcurrency, 8);
    assert.equal(settings.imageJobUserConcurrency, 8);
    assert.equal(settings.imageQueuePrefix, "db-prefix");
    assert.equal(settings.imageWorkerConcurrency, 64);
    assert.equal(settings.imageQueueAttempts, 20);
    assert.equal(settings.imageQueueBackoffMs, 600000);
  });

  it("redacts Redis credentials and never exposes the raw URL in public settings", () => {
    const update = getImageQueueSettingsUpdate({
      imageQueueRedisUrl: "redis://user:secret@cache.internal:6379/3"
    });
    assert.equal(update.error, undefined);
    assert.ok(update.data.imageQueueRedisUrlEncrypted);

    const settings = resolveImageQueueSettings({
      imageQueueRedisUrlEncrypted: update.data.imageQueueRedisUrlEncrypted
    }, {});
    const publicSettings = toPublicImageQueueSettings(settings);

    assert.equal(settings.redisUrl, "redis://user:secret@cache.internal:6379/3");
    assert.equal(publicSettings.imageQueueRedisConfigured, true);
    assert.equal(publicSettings.imageQueueRedisTarget, "redis://cache.internal:6379/3");
    assert.equal(JSON.stringify(publicSettings).includes("secret"), false);
    assert.equal(JSON.stringify(publicSettings).includes("user:"), false);
  });

  it("validates update input and supports explicit Redis URL clearing", () => {
    assert.deepEqual(sanitizeRedisUrl("http://example.com"), undefined);
    assert.deepEqual(sanitizeRedisUrl("redis://localhost:6379/0"), "redis://localhost:6379/0");
    assert.deepEqual(sanitizeImageQueuePrefix("bad prefix"), undefined);
    assert.deepEqual(sanitizeImageQueuePrefix("image2:prod_1"), "image2:prod_1");
    assert.equal(getRedisTarget("redis://:secret@localhost:6379/0"), "redis://localhost:6379/0");

    const invalid = getImageQueueSettingsUpdate({
      imageQueueMode: "sideways",
      imageQueuePrefix: "bad prefix"
    });
    assert.equal(invalid.error, "Queue mode must be inline or redis.");

    const clear = getImageQueueSettingsUpdate({
      clearImageQueueRedisUrl: true,
      imageQueueRedisUrl: "redis://localhost:6379/0"
    });
    assert.deepEqual(clear.data, {
      imageQueueRedisUrlEncrypted: null
    });
  });

  it("builds stable public settings from records", () => {
    const publicSettings = getPublicImageQueueSettingsFromRecord({
      imageQueueMode: "redis",
      imageJobConcurrency: 4,
      imageJobUserConcurrency: 2,
      imageQueuePrefix: "image2-prod",
      imageWorkerConcurrency: 12,
      imageQueueAttempts: 5,
      imageQueueBackoffMs: 7000
    }, {});

    assert.equal(publicSettings.imageQueueMode, "redis");
    assert.equal(publicSettings.imageJobConcurrency, 4);
    assert.equal(publicSettings.imageJobUserConcurrency, 2);
    assert.equal(publicSettings.imageQueuePrefix, "image2-prod");
    assert.equal(publicSettings.imageWorkerConcurrency, 12);
    assert.equal(publicSettings.imageQueueAttempts, 5);
    assert.equal(publicSettings.imageQueueBackoffMs, 7000);
    assert.equal(publicSettings.imageQueueRedisConfigured, false);
    assert.equal(publicSettings.imageQueueRedisTarget, "disabled");
  });
});
