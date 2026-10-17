import { afterEach, expect, it, vi } from "vitest";

vi.mock("@workspace/db", () => ({
  pool: { query: vi.fn().mockResolvedValue({ rows: [] }) },
}));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});
it("loads and polls as a standalone worker without HTTP or authentication configuration", async () => {
  vi.stubEnv("PORT", undefined);
  const { runAssetCleanupOnce } =
    await import("../artifacts/api-server/src/services/asset-cleanup-worker");
  const boundary = { inspect: vi.fn(), remove: vi.fn() };
  expect(await runAssetCleanupOnce(boundary)).toBe(false);
  expect(boundary.inspect).not.toHaveBeenCalled();
});
