import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertAssetCleanupConfiguration,
  superviseAssetCleanup,
} from "../artifacts/api-server/src/services/asset-cleanup-runtime";

const config = {
  ASSET_CLEANUP_ENABLED: "true",
  ASSET_CLEANUP_ALLOWED_NAMESPACES: "/test-bucket/private",
  DATABASE_URL: "postgresql://127.0.0.1:1/isolated_no_connection",
  R2_ENDPOINT: "https://0123456789abcdef.r2.cloudflarestorage.com",
  R2_ACCESS_KEY_ID: "disposable-test-key-id",
  R2_SECRET_ACCESS_KEY: "disposable-test-secret",
};
afterEach(() => vi.useRealTimers());
describe("asset cleanup supervised runtime", () => {
  it.each([
    {},
    { ...config, ASSET_CLEANUP_ENABLED: "false" },
    { ...config, ASSET_CLEANUP_ENABLED: "1" },
    { ...config, ASSET_CLEANUP_ALLOWED_NAMESPACES: "" },
    {
      ...config,
      ASSET_CLEANUP_ALLOWED_NAMESPACES: "/bucket/private/../victim",
    },
    { ...config, ASSET_CLEANUP_ALLOWED_NAMESPACES: "/bucket/private," },
    { ...config, DATABASE_URL: "https://not-postgres.invalid" },
    { ...config, DATABASE_URL: "" },
    { ...config, R2_ENDPOINT: "" },
    {
      ...config,
      R2_ENDPOINT: "http://0123456789abcdef.r2.cloudflarestorage.com",
    },
    { ...config, R2_ENDPOINT: "https://example.test/bucket" },
    { ...config, R2_ACCESS_KEY_ID: "" },
    { ...config, R2_SECRET_ACCESS_KEY: "" },
  ])(
    "refuses unsafe or implicit startup before dependency initialization: %j",
    (env) => {
      expect(() => assertAssetCleanupConfiguration(env)).toThrow(
        "ASSET_CLEANUP_CONFIGURATION_REQUIRED",
      );
    },
  );
  it("accepts explicit canonical namespace snapshots including retired prefixes", () => {
    expect(() =>
      assertAssetCleanupConfiguration({
        ...config,
        ASSET_CLEANUP_ALLOWED_NAMESPACES:
          "/test-bucket/private, /retired-bucket/previous/prefix",
      }),
    ).not.toThrow();
  });
  it("drains the current job and closes the pool on shutdown without leasing another", async () => {
    const controller = new AbortController();
    const runOnce = vi.fn(async () => {
      controller.abort();
      return true;
    });
    const close = vi.fn().mockResolvedValue(undefined);
    await superviseAssetCleanup(
      { runOnce, close, warn: vi.fn() },
      controller.signal,
    );
    expect(runOnce).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });
  it("interrupts the idle poll delay promptly on shutdown", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const runOnce = vi.fn().mockResolvedValue(false);
    const close = vi.fn().mockResolvedValue(undefined);
    const running = superviseAssetCleanup(
      { runOnce, close, warn: vi.fn() },
      controller.signal,
    );
    await vi.advanceTimersByTimeAsync(1);
    controller.abort();
    await running;
    expect(runOnce).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("retries database iteration errors without passing raw errors to logs", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const warn = vi.fn();
    const runOnce = vi
      .fn()
      .mockRejectedValueOnce(new Error("postgresql://private-password"))
      .mockImplementationOnce(async () => {
        controller.abort();
        return false;
      });
    const running = superviseAssetCleanup(
      { runOnce, close: vi.fn().mockResolvedValue(undefined), warn },
      controller.signal,
    );
    await vi.advanceTimersByTimeAsync(2000);
    await running;
    expect(warn.mock.calls).toEqual([["Asset cleanup iteration failed"]]);
    expect(runOnce).toHaveBeenCalledTimes(2);
  });
  it("fails closed on a stuck provider before the five-minute lease can expire", async () => {
    vi.useFakeTimers();
    const runOnce = vi.fn(() => new Promise<boolean>(() => {}));
    const close = vi.fn().mockResolvedValue(undefined);
    const running = superviseAssetCleanup(
      { runOnce, close, warn: vi.fn() },
      new AbortController().signal,
    );
    const rejected = expect(running).rejects.toThrow(
      "ASSET_CLEANUP_DEADLINE_EXCEEDED",
    );
    await vi.advanceTimersByTimeAsync(120000);
    await rejected;
    expect(runOnce).toHaveBeenCalledTimes(1);
    // Production entrypoint must exit, not await an unbounded pool drain.
    expect(close).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("bounds pool shutdown too", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    controller.abort();
    const running = superviseAssetCleanup(
      {
        runOnce: vi.fn(),
        close: () => new Promise<void>(() => {}),
        warn: vi.fn(),
      },
      controller.signal,
    );
    const rejected = expect(running).rejects.toThrow(
      "ASSET_CLEANUP_DEADLINE_EXCEEDED",
    );
    await vi.advanceTimersByTimeAsync(10000);
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
  });
});
