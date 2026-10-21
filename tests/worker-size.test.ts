import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain ESM CI script without type declarations
import { parseUploadSize } from "../scripts/ci-check-worker-size.mjs";

describe("Cloudflare Worker size gate", () => {
  it("reads Wrangler's raw and gzip upload sizes", () => {
    expect(
      parseUploadSize(
        "Your Worker has access to...\nTotal Upload: 11750.49 KiB / gzip: 2636.01 KiB\n--dry-run: exiting now.",
      ),
    ).toEqual({ raw: 11750.49, gzip: 2636.01 });
  });
  it("returns null when Wrangler did not report a size", () => {
    expect(parseUploadSize("✘ [ERROR] Build failed")).toBeNull();
  });
});
