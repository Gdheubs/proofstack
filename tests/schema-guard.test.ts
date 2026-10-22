import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const readiness = vi.hoisted(() => ({ status: "not_ready" as string }));
vi.mock("../artifacts/api-server/src/services/health", () => ({
  checkReadiness: async () => ({ status: readiness.status, checks: {} }),
}));
import {
  resetSchemaGuard,
  schemaGuard,
} from "../artifacts/api-server/src/middlewares/schema-guard";

const call = async (path: string) => {
  let error: unknown = "not called";
  await schemaGuard({ path } as Request, {} as Response, (e?: unknown) => {
    error = e;
  });
  return error as { status?: number; code?: string } | undefined;
};

describe("API refuses to run ahead of its database migrations", () => {
  beforeEach(() => {
    resetSchemaGuard();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("answers 503 in production until the schema matches, then recovers", async () => {
    vi.stubEnv("NODE_ENV", "production");
    readiness.status = "not_ready";
    expect(await call("/auth/action")).toMatchObject({
      status: 503,
      code: "SERVICE_UPDATING",
    });
    expect(await call("/healthz")).toBeUndefined();
    readiness.status = "ready";
    vi.advanceTimersByTime(6000);
    expect(await call("/auth/action")).toBeUndefined();
  });

  it("does not interfere outside production", async () => {
    vi.stubEnv("NODE_ENV", "test");
    readiness.status = "not_ready";
    expect(await call("/auth/action")).toBeUndefined();
  });
});
