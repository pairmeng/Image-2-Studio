import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  createImageResponseContext,
  createNotModifiedImageResponse,
  isFreshImageRequest
} from "../src/lib/server/image-response";

describe("authenticated image response caching", () => {
  it("uses private cache validators and recognizes fresh requests", async () => {
    const dir = join(process.cwd(), "storage", "generated", `image-response-${process.pid}-${Date.now()}`);
    const filePath = join(dir, "sample.png");
    mkdirSync(dir, { recursive: true });
    writeFileSync(filePath, Buffer.from("png"));

    try {
      const context = await createImageResponseContext({
        id: "image-1",
        filename: "sample.png",
        filePath,
        imageUrl: "/api/images/file/image-1",
        mimeType: "image/png"
      });

      assert.equal(context.headers["cache-control"], "private, max-age=86400, immutable");
      assert.equal(context.headers["content-type"], "image/png");
      assert.match(context.headers.etag, /^".+"$/);

      assert.equal(isFreshImageRequest(new Request("http://local/image", {
        headers: { "if-none-match": context.headers.etag }
      }), context), true);

      const response = createNotModifiedImageResponse(context.headers);
      assert.equal(response.status, 304);
      assert.equal(response.headers.get("content-length"), null);
      assert.equal(response.headers.get("etag"), context.headers.etag);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
