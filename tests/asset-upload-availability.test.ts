import { afterEach, describe, expect, it, vi } from "vitest";
import { pool } from "@workspace/db";
import { requestUpload } from "../artifacts/api-server/src/services/community-assets";
import { r2 } from "../artifacts/api-server/src/lib/objectStorage";
const body = { name: "test.png", size: 8, contentType: "image/png" };
const uid = "cc1575d2-514f-42fb-97b4-f6b6b7503a75";
const r2Env = {
  R2_ENDPOINT: "https://0123456789abcdef.r2.cloudflarestorage.com",
  R2_ACCESS_KEY_ID: "disposable-test-key-id",
  R2_SECRET_ACCESS_KEY: "disposable-test-secret",
};
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
describe("upload availability", () => {
  it.each([
    ["", r2Env],
    ["/test-bucket", r2Env],
    ["/test-bucket/private/../outside", r2Env],
    ["/test-bucket/private", { ...r2Env, R2_ENDPOINT: "" }],
    [
      "/test-bucket/private",
      {
        ...r2Env,
        R2_ENDPOINT: "http://0123456789abcdef.r2.cloudflarestorage.com",
      },
    ],
    ["/test-bucket/private", { ...r2Env, R2_ACCESS_KEY_ID: "" }],
    ["/test-bucket/private", { ...r2Env, R2_SECRET_ACCESS_KEY: "" }],
  ])(
    "returns structured 503 for namespace %s / unusable R2 settings before SQL or storage",
    async (directory, settings) => {
      vi.stubEnv("PRIVATE_OBJECT_DIR", directory);
      for (const [name, value] of Object.entries(settings))
        vi.stubEnv(name, value);
      const connect = vi.spyOn(pool, "connect");
      const client = vi.spyOn(r2, "client");
      await expect(requestUpload(body, uid)).rejects.toMatchObject({
        status: 503,
        code: "STORAGE_CONFIGURATION_REQUIRED",
      });
      expect(connect).not.toHaveBeenCalled();
      expect(client).not.toHaveBeenCalled();
    },
  );
});
