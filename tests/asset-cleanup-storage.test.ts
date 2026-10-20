import { afterEach, describe, expect, it, vi } from "vitest";
import { r2 } from "../artifacts/api-server/src/lib/objectStorage";

const id = "cc1575d2-514f-42fb-97b4-f6b6b7503a76";
const etag = "0123456789abcdef0123456789abcdef";
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
function unreachable() {
  return vi.spyOn(r2, "client").mockImplementation(() => {
    throw new Error("storage must not be reached");
  });
}
function provider(send: ReturnType<typeof vi.fn>) {
  return vi.spyOn(r2, "client").mockReturnValue({ send } as never);
}
async function boundary() {
  return (
    await import("../artifacts/api-server/src/services/asset-cleanup-storage")
  ).cleanupStorage;
}
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
      const client = unreachable();
      await expect((await boundary()).inspect(malicious)).rejects.toThrow(
        "Invalid cleanup target",
      );
      expect(client).not.toHaveBeenCalled();
    },
  );
  it.each([
    "",
    "0",
    "1e3",
    undefined,
    "123/..",
    `"${etag}"`,
    etag.toUpperCase(),
  ])(
    "rejects missing/unsafe delete version %s before storage",
    async (version) => {
      vi.stubEnv("ASSET_CLEANUP_ALLOWED_NAMESPACES", "/test-bucket/private");
      const client = unreachable();
      await expect(
        (await boundary()).remove(target, version as string),
      ).rejects.toThrow("Invalid cleanup version");
      expect(client).not.toHaveBeenCalled();
    },
  );
  it("treats only confirmed storage 404 as absent, not denial or provider failure", async () => {
    vi.stubEnv("ASSET_CLEANUP_ALLOWED_NAMESPACES", "/test-bucket/private");
    const denied = { name: "AccessDenied", $metadata: { httpStatusCode: 403 } };
    const send = vi
      .fn()
      .mockRejectedValueOnce({
        name: "NotFound",
        $metadata: { httpStatusCode: 404 },
      })
      .mockRejectedValueOnce(denied)
      .mockRejectedValueOnce(new Error("socket hang up"));
    provider(send);
    const storage = await boundary();
    expect(await storage.inspect(target)).toBeNull();
    await expect(storage.inspect(target)).rejects.toBe(denied);
    await expect(storage.inspect(target)).rejects.toThrow("socket hang up");
  });
  it("rejects namespace snapshots not in the worker allowlist before storage initialization", async () => {
    vi.stubEnv("ASSET_CLEANUP_ALLOWED_NAMESPACES", "/other-bucket/private");
    const client = unreachable();
    await expect((await boundary()).inspect(target)).rejects.toThrow(
      "Cleanup namespace not allowlisted",
    );
    expect(client).not.toHaveBeenCalled();
  });
  it.each([undefined, "", "0", "1e3", "not-an-etag"])(
    "rejects malformed provider ETag %s",
    async (value) => {
      vi.stubEnv("ASSET_CLEANUP_ALLOWED_NAMESPACES", "/test-bucket/private");
      provider(vi.fn().mockResolvedValue({ ETag: value }));
      await expect((await boundary()).inspect(target)).rejects.toThrow(
        "Storage version required",
      );
    },
  );
  it("uses only an explicitly allowlisted captured key after configuration rotates", async () => {
    vi.stubEnv("PRIVATE_OBJECT_DIR", "/different-bucket/new-prefix");
    vi.stubEnv("ASSET_CLEANUP_ALLOWED_NAMESPACES", "/test-bucket/private");
    const send = vi
      .fn()
      .mockResolvedValueOnce({ ETag: `"${etag}"` })
      .mockResolvedValueOnce({});
    provider(send);
    const storage = await boundary();
    expect(await storage.inspect(target)).toBe(etag);
    await storage.remove(target, etag);
    const [head, remove] = send.mock.calls.map(([command]) => command);
    expect(head.constructor.name).toBe("HeadObjectCommand");
    expect(remove.constructor.name).toBe("DeleteObjectCommand");
    for (const command of [head, remove])
      expect(command.input).toEqual({
        Bucket: "test-bucket",
        Key: target.object_name,
      });
  });
  it("accepts multipart ETags and legacy numeric generations", async () => {
    vi.stubEnv("ASSET_CLEANUP_ALLOWED_NAMESPACES", "/test-bucket/private");
    provider(vi.fn().mockResolvedValue({}));
    const storage = await boundary();
    await expect(storage.remove(target, `${etag}-12`)).resolves.toBeUndefined();
    await expect(storage.remove(target, "123")).resolves.toBeUndefined();
  });
});
