import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { ApiClientError, fetchBlob, fetchJson, isUnauthorizedError } from "../src/components/studio/utils/api-client";

const originalFetch = globalThis.fetch;

function mockFetch(response: Response) {
  globalThis.fetch = (async () => response) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("studio API client", () => {
  it("returns parsed JSON for successful responses", async () => {
    mockFetch(Response.json({ ok: true, value: 42 }));

    const body = await fetchJson<{ ok: boolean; value: number }>("/api/example");

    assert.deepEqual(body, { ok: true, value: 42 });
  });

  it("returns an empty object for empty or non-JSON success responses", async () => {
    mockFetch(new Response(null, { status: 204 }));
    assert.deepEqual(await fetchJson<Record<string, never>>("/api/empty"), {});

    mockFetch(new Response("not json", { status: 200 }));
    assert.deepEqual(await fetchJson<Record<string, never>>("/api/plain"), {});
  });

  it("throws status, message, code, and body for JSON error responses", async () => {
    mockFetch(Response.json({ error: "Quota exceeded.", code: "quota_exceeded" }, { status: 429 }));

    await assert.rejects(
      () => fetchJson("/api/limited", { fallbackMessage: "Fallback failed." }),
      (error) => {
        assert.equal(error instanceof ApiClientError, true);
        assert.equal((error as ApiClientError).status, 429);
        assert.equal((error as ApiClientError).message, "Quota exceeded.");
        assert.equal((error as ApiClientError).code, "quota_exceeded");
        assert.deepEqual((error as ApiClientError).body, { error: "Quota exceeded.", code: "quota_exceeded" });
        return true;
      }
    );
  });

  it("detects unauthorized API errors", async () => {
    mockFetch(Response.json({ error: "Unauthorized." }, { status: 401 }));

    await assert.rejects(
      () => fetchJson("/api/private"),
      (error) => {
        assert.equal(isUnauthorizedError(error), true);
        return true;
      }
    );
  });

  it("uses fallback messages for non-JSON error responses", async () => {
    mockFetch(new Response("upstream text", { status: 502 }));

    await assert.rejects(
      () => fetchJson("/api/upstream", { fallbackMessage: "Gateway failed." }),
      (error) => {
        assert.equal(error instanceof ApiClientError, true);
        assert.equal((error as ApiClientError).status, 502);
        assert.equal((error as ApiClientError).message, "Gateway failed.");
        assert.equal((error as ApiClientError).body, null);
        return true;
      }
    );
  });

  it("returns blobs and preserves error handling for blob endpoints", async () => {
    mockFetch(new Response("zip-bytes", { status: 200 }));

    const blob = await fetchBlob("/api/export");
    assert.equal(await blob.text(), "zip-bytes");

    mockFetch(Response.json({ error: "Export failed." }, { status: 400 }));
    await assert.rejects(
      () => fetchBlob("/api/export", { fallbackMessage: "Fallback export failed." }),
      (error) => {
        assert.equal(error instanceof ApiClientError, true);
        assert.equal((error as ApiClientError).message, "Export failed.");
        return true;
      }
    );
  });
});
