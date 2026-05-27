import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeAdminUsageRange } from "../src/lib/admin-usage";

describe("admin usage range normalization", () => {
  it("accepts the supported 30 day range", () => {
    assert.equal(normalizeAdminUsageRange("30d"), "30d");
  });

  it("defaults unsupported values to 7 days", () => {
    assert.equal(normalizeAdminUsageRange("7d"), "7d");
    assert.equal(normalizeAdminUsageRange("90d"), "7d");
    assert.equal(normalizeAdminUsageRange(null), "7d");
    assert.equal(normalizeAdminUsageRange(undefined), "7d");
  });
});
