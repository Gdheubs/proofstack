import { afterEach, describe, expect, it, vi } from "vitest";
import { objectStorageClient } from "../artifacts/api-server/src/lib/objectStorage";

const id = "cc1575d2-514f-42fb-97b4-f6b6b7503a76";
const target = {
  bucket: "test-bucket",
  namespace: "private",
  object_path: `/objects/ready/${id}`,
  object_name: `private/ready/${id}`,
};
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
describe("cleanup storage boundary", () => {
  it.each([
    { object_name: "private/ready/../../victim" },
    { object_name: `outside/ready/${id}` },
    {
      object_path: `/objects/uploads/${id}`,
      object_name: `private/ready/${id}`,
    },
    {
      object_path: "/objects/ready/not-a-uuid",
      object_name: "private/ready/not-a-uuid",
    },
    {
      namespace: "private/../outside",
      object_name: `private/../outside/ready/${id}`,
    },
    { bucket: "bucket/other" },
  ])(
    "rejects malformed/reused cleanup targets before any storage call: %j",
    async (patch) => {
      const malicious = { ...target, ...patch };
      vi.stubEnv(
        "ASSET_CLEANUP_ALLOWED_NAMESPACES",
        `/${malicious.bucket}/${malicious.namespace}`,
      );
      const bucket = vi
        .spyOn(objectStorageClient, "bucket")
        .mockImplementation(() => {
          throw new Error("storage must not be reached");
        });
      const { cleanupStorage } =
        await import("../artifacts/api-server/src/services/asset-cleanup-storage");
      await expect(cleanupStorage.inspect(malicious)).rejects.toThrow(
        "Invalid cleanup target",
      );
      expect(bucket).not.toHaveBeenCalled();
    },
  );
  it.each(["", "0", "1e3", undefined, "123/.."])(
    "rejects missing/unsafe delete generation %s before storage",
    async (generation) => {
      vi.stubEnv("ASSET_CLEANUP_ALLOWED_NAMESPACES", "/test-bucket/private");
      const bucket = vi
        .spyOn(objectStorageClient, "bucket")
        .mockImplementation(() => {
          throw new Error("storage must not be reached");
        });
      const { cleanupStorage } =
        await import("../artifacts/api-server/src/services/asset-cleanup-storage");
      await expect(
        cleanupStorage.remove(target, generation as string),
      ).rejects.toThrow("Invalid cleanup generation");
      expect(bucket).not.toHaveBeenCalled();
    },
  );
  it("treats only confirmed storage 404 as absent, not denial or provider failure", async () => {
    vi.stubEnv("ASSET_CLEANUP_ALLOWED_NAMESPACES", "/test-bucket/private");
    const getMetadata = vi
      .fn()
      .mockRejectedValueOnce({ code: 404 })
      .mockRejectedValueOnce({ code: 403 });
    vi.spyOn(objectStorageClient, "bucket").mockReturnValue({
      file: () => ({ getMetadata }),
    } as never);
    const { cleanupStorage } =
      await import("../artifacts/api-server/src/services/asset-cleanup-storage");
    expect(await cleanupStorage.inspect(target)).toBeNull();
    await expect(cleanupStorage.inspect(target)).rejects.toEqual({ code: 403 });
  });
  it("rejects namespace snapshots not in the worker allowlist before storage initialization", async () => {
    vi.stubEnv("ASSET_CLEANUP_ALLOWED_NAMESPACES", "/other-bucket/private");
    const bucket = vi
      .spyOn(objectStorageClient, "bucket")
      .mockImplementation(() => {
        throw new Error("storage must not be reached");
      });
    const { cleanupStorage } =
      await import("../artifacts/api-server/src/services/asset-cleanup-storage");
    await expect(cleanupStorage.inspect(target)).rejects.toThrow(
      "Cleanup namespace not allowlisted",
    );
    expect(bucket).not.toHaveBeenCalled();
  });
  it.each([undefined, "", "0", "1e3", 123])(
    "rejects malformed provider metadata generation %s",
    async (generation) => {
      vi.stubEnv("ASSET_CLEANUP_ALLOWED_NAMESPACES", "/test-bucket/private");
      const getMetadata = vi.fn().mockResolvedValue([{ generation }]);
      vi.spyOn(objectStorageClient, "bucket").mockReturnValue({
        file: () => ({ getMetadata }),
      } as never);
      const { cleanupStorage } =
        await import("../artifacts/api-server/src/services/asset-cleanup-storage");
      await expect(cleanupStorage.inspect(target)).rejects.toThrow(
        "Storage generation required",
      );
    },
  );
  it("uses only an explicitly allowlisted captured namespace and generation-fenced delete after configuration rotates", async () => {
    vi.stubEnv("PRIVATE_OBJECT_DIR", "/different-bucket/new-prefix");
    vi.stubEnv("ASSET_CLEANUP_ALLOWED_NAMESPACES", "/test-bucket/private");
    const file = {
      getMetadata: vi.fn().mockResolvedValue([{ generation: "123" }]),
      delete: vi.fn().mockResolvedValue([]),
    };
    const fileFor = vi.fn().mockReturnValue(file);
    const bucket = vi
      .spyOn(objectStorageClient, "bucket")
      .mockReturnValue({ file: fileFor } as never);
    const { cleanupStorage } =
      await import("../artifacts/api-server/src/services/asset-cleanup-storage");
    expect(await cleanupStorage.inspect(target)).toBe("123");
    await cleanupStorage.remove(target, "123");
    expect(bucket.mock.calls).toEqual([["test-bucket"], ["test-bucket"]]);
    expect(fileFor.mock.calls).toEqual([
      [target.object_name],
      [target.object_name],
    ]);
    expect(file.delete).toHaveBeenCalledWith({
      ifGenerationMatch: "123",
      ignoreNotFound: true,
    });
  });
});
