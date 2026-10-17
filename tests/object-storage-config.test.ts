import { afterEach, describe, expect, it, vi } from "vitest";
import { ObjectStorageService } from "../artifacts/api-server/src/lib/objectStorage";

afterEach(() => vi.unstubAllEnvs());

describe("private object-storage namespace", () => {
  it.each([
    "/bucket",
    "/bucket/private/",
    "/bucket//private",
    "bucket/private",
    "/bucket/../private",
    "/bucket/private?mode=public",
    "/bucket/private space",
    "/bucket/private\\nested",
  ])(
    "rejects unsupported namespace %s before signing an upload",
    async (namespace) => {
      vi.stubEnv("PRIVATE_OBJECT_DIR", namespace);
      const service = new ObjectStorageService();
      expect(() => service.getPrivateObjectDir()).toThrow("PRIVATE_OBJECT_DIR");
    },
  );
  it.each([
    "/replit-bucket/.private",
    "/storage.example-bucket/private/nested",
  ])("preserves canonical bucket/prefix %s", (namespace) => {
    vi.stubEnv("PRIVATE_OBJECT_DIR", namespace);
    expect(new ObjectStorageService().getPrivateObjectDir()).toBe(namespace);
  });
});
