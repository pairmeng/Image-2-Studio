import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  decodeAdminImageCursor,
  encodeAdminImageCursor,
  normalizeAdminImageFilters,
  normalizeAdminImageLimit
} from "../src/lib/admin-images";
import { AppError } from "../src/lib/server/errors";

describe("admin image pagination and filters", () => {
  it("encodes and decodes image cursors with createdAt and id", () => {
    const cursor = encodeAdminImageCursor({
      id: "image-1",
      createdAt: new Date("2026-05-27T08:30:00.000Z")
    });

    assert.deepEqual(decodeAdminImageCursor(cursor), {
      id: "image-1",
      createdAt: new Date("2026-05-27T08:30:00.000Z")
    });
  });

  it("rejects invalid image cursors", () => {
    assert.throws(
      () => decodeAdminImageCursor("not-base64-json"),
      (error) => error instanceof AppError && error.status === 400
    );
  });

  it("normalizes image list limits", () => {
    assert.equal(normalizeAdminImageLimit(null), 30);
    assert.equal(normalizeAdminImageLimit("0"), 30);
    assert.equal(normalizeAdminImageLimit("12"), 12);
    assert.equal(normalizeAdminImageLimit("1000"), 60);
  });

  it("normalizes optional filters and Asia/Shanghai date bounds", () => {
    const params = new URLSearchParams({
      limit: "45",
      cursor: " cursor-value ",
      userId: " user-1 ",
      provider: " openai ",
      model: " gpt-image-2 ",
      dateFrom: "2026-05-01",
      dateTo: "2026-05-27",
      q: " portrait "
    });

    const filters = normalizeAdminImageFilters(params);

    assert.equal(filters.limit, 45);
    assert.equal(filters.cursor, "cursor-value");
    assert.equal(filters.userId, "user-1");
    assert.equal(filters.provider, "openai");
    assert.equal(filters.model, "gpt-image-2");
    assert.equal(filters.q, "portrait");
    assert.equal(filters.dateFrom?.toISOString(), "2026-04-30T16:00:00.000Z");
    assert.equal(filters.dateTo?.toISOString(), "2026-05-27T16:00:00.000Z");
  });

  it("drops blank and invalid filters", () => {
    const filters = normalizeAdminImageFilters(new URLSearchParams({
      userId: " ",
      dateFrom: "not-a-date",
      dateTo: "not-a-date"
    }));

    assert.equal(filters.userId, null);
    assert.equal(filters.dateFrom, null);
    assert.equal(filters.dateTo, null);
  });
});
