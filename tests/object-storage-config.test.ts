import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ObjectNotFoundError,
  ObjectStorageService,
  StorageConfigurationError,
  r2,
  r2Settings,
} from "../artifacts/api-server/src/lib/objectStorage";

const uuid = "cc1575d2-514f-42fb-97b4-f6b6b7503a76";
const endpoint = "https://0123456789abcdef.r2.cloudflarestorage.com";

describe("R2 object locations and settings", () => {
  it("maps only canonical ready/upload object paths into the configured namespace", () => {
    vi.stubEnv("PRIVATE_OBJECT_DIR", "/assets/prod/images");
    const service = new ObjectStorageService();
    expect(service.locate(`/objects/ready/${uuid}`)).toEqual({
      bucket: "assets",
      key: `prod/images/ready/${uuid}`,
    });
    for (const path of [
      `/objects/ready/${uuid}/../x`,
      `/objects/other/${uuid}`,
      "/objects/ready/not-a-uuid",
      `objects/ready/${uuid}`,
      `/objects/ready/${uuid.toUpperCase()}`,
    ])
      expect(() => service.locate(path)).toThrow(ObjectNotFoundError);
  });
  it.each([
    {},
    { R2_ENDPOINT: endpoint, R2_ACCESS_KEY_ID: "id" },
    { R2_ENDPOINT: endpoint, R2_SECRET_ACCESS_KEY: "secret" },
    {
      R2_ENDPOINT: "http://0123456789abcdef.r2.cloudflarestorage.com",
      R2_ACCESS_KEY_ID: "id",
      R2_SECRET_ACCESS_KEY: "secret",
    },
    {
      R2_ENDPOINT: `${endpoint}/bucket`,
      R2_ACCESS_KEY_ID: "id",
      R2_SECRET_ACCESS_KEY: "secret",
    },
  ])("rejects unusable R2 settings %j without echoing values", (env) => {
    try {
      r2Settings(env);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(StorageConfigurationError);
      expect(String(error)).not.toContain("secret");
    }
  });
  it("builds a path-style R2 client without optional SDK checksums", async () => {
    vi.stubEnv("R2_ENDPOINT", endpoint);
    vi.stubEnv("R2_ACCESS_KEY_ID", "id");
    vi.stubEnv("R2_SECRET_ACCESS_KEY", "secret");
    const config = r2.client().config;
    expect(await config.region()).toBe("auto");
    expect(config.forcePathStyle).toBe(true);
    expect(await config.requestChecksumCalculation()).toBe("WHEN_REQUIRED");
    expect(await config.responseChecksumValidation()).toBe("WHEN_REQUIRED");
    expect(r2.client()).toBe(r2.client());
  });
});

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
