import { afterEach, describe, expect, it, vi } from "vitest";
import {
  requestUpload,
  storage,
} from "../artifacts/api-server/src/services/community-assets";
const body = { name: "test.png", size: 8, contentType: "image/png" };
const uid = "cc1575d2-514f-42fb-97b4-f6b6b7503a75";
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
describe("upload availability", () => {
  it.each(["", "/test-bucket", "/test-bucket/private/../outside"])(
    "returns structured 503 for unsafe namespace %s before touching signing/storage",
    async (directory) => {
      vi.stubEnv("COMMUNITY_UPLOADS_ENABLED", "true");
      vi.stubEnv("PRIVATE_OBJECT_DIR", directory);
      const sign = vi.spyOn(storage, "getObjectEntityUploadURL");
      await expect(requestUpload(body, uid)).rejects.toMatchObject({
        status: 503,
        code: "STORAGE_CONFIGURATION_REQUIRED",
      });
      expect(sign).not.toHaveBeenCalled();
    },
  );
});
