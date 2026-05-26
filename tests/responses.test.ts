import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "../src/lib/server/errors";
import { handleRouteError, readJsonBody } from "../src/lib/server/responses";

describe("route error responses", () => {
  it("preserves AppError status codes and messages", async () => {
    const response = handleRouteError(new AppError("Provider is not configured.", 503), { NODE_ENV: "production" });
    const body = await response.json() as { error?: string };

    assert.equal(response.status, 503);
    assert.equal(body.error, "Provider is not configured.");
  });

  it("hides unexpected error details in production", async () => {
    const originalConsoleError = console.error;
    const logs: unknown[][] = [];
    console.error = (...args: unknown[]) => {
      logs.push(args);
    };

    try {
      const response = handleRouteError(new Error("database password leaked"), { NODE_ENV: "production" });
      const body = await response.json() as { error?: string };

      assert.equal(response.status, 500);
      assert.equal(body.error, "Request failed.");
      assert.equal(logs.length, 1);
      assert.deepEqual(logs[0]?.slice(0, 1), ["[route] Unexpected error"]);
    } finally {
      console.error = originalConsoleError;
    }
  });

  it("keeps unexpected error details visible outside production", async () => {
    const originalConsoleError = console.error;
    console.error = () => undefined;

    try {
      const response = handleRouteError(new Error("developer diagnostic"), { NODE_ENV: "development" });
      const body = await response.json() as { error?: string };

      assert.equal(response.status, 500);
      assert.equal(body.error, "developer diagnostic");
    } finally {
      console.error = originalConsoleError;
    }
  });

  it("reads JSON object request bodies", async () => {
    const request = new Request("http://localhost/api/example", {
      method: "POST",
      body: JSON.stringify({ name: "Project", enabled: true })
    });

    assert.deepEqual(await readJsonBody(request), {
      name: "Project",
      enabled: true
    });
  });

  it("uses an empty body for blank, invalid, or non-object JSON", async () => {
    const blank = new Request("http://localhost/api/example", { method: "POST" });
    const invalid = new Request("http://localhost/api/example", {
      method: "POST",
      body: "{"
    });
    const array = new Request("http://localhost/api/example", {
      method: "POST",
      body: JSON.stringify(["not", "an", "object"])
    });

    assert.deepEqual(await readJsonBody(blank), {});
    assert.deepEqual(await readJsonBody(invalid), {});
    assert.deepEqual(await readJsonBody(array), {});
  });
});
