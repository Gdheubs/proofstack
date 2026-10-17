import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("native integration fixture isolation", () => {
  it("serializes files sharing database-wide fixture/DDL state without disabling explicit concurrent-client tests", async () => {
    vi.stubEnv("RUN_DB_TESTS", "1");
    vi.resetModules();
    const { default: config } = await import("../vitest.config");
    expect(config.test?.fileParallelism).toBe(false);
  });
  it("retains parallel execution for independent non-database unit files", async () => {
    vi.stubEnv("RUN_DB_TESTS", undefined);
    vi.resetModules();
    const { default: config } = await import("../vitest.config");
    expect(config.test?.fileParallelism).toBe(true);
  });
});
