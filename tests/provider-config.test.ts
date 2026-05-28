import test from "node:test";
import assert from "node:assert/strict";
import {
  isProviderAdapterId,
  isProviderId
} from "../src/lib/models";

test("provider ids allow dynamic V8 provider keys", () => {
  assert.equal(isProviderId("openai"), true);
  assert.equal(isProviderId("replicate"), true);
  assert.equal(isProviderId("custom-provider_1"), true);
  assert.equal(isProviderId("bad provider"), false);
  assert.equal(isProviderId("../secret"), false);
});

test("provider adapter ids stay constrained to registered adapters", () => {
  assert.equal(isProviderAdapterId("openai"), true);
  assert.equal(isProviderAdapterId("openai-compatible"), true);
  assert.equal(isProviderAdapterId("mock"), true);
  assert.equal(isProviderAdapterId("unknown"), false);
});
