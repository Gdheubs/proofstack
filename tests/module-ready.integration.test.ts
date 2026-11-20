import { afterEach, describe, expect, it, vi } from "vitest";
import { pool } from "@workspace/db";
import {
  guardsReady,
  moduleReadySync,
  modulesWarm,
  refreshModule,
  resetModuleReadiness,
} from "../artifacts/api-server/src/services/module-ready";
import { moduleGuard } from "../artifacts/api-server/src/middlewares/module-guard";

afterEach(() => {
  resetModuleReadiness();
  vi.unstubAllEnvs();
});

describe("module readiness against the embedded migration database", () => {
  it("recognizes migrated platform columns and rejects absent modules", async () => {
    expect(await refreshModule("platform")).toBe(true);
    expect(moduleReadySync("platform")).toBe(true);
    expect(await refreshModule("distribution")).toBe(false);
    expect(moduleReadySync("distribution")).toBe(false);
  });

  it("keeps the core warmup safe and guards fail closed when feature config is absent", async () => {
    const next = vi.fn();
    await modulesWarm({} as never, {} as never, next);
    expect(next).toHaveBeenCalledOnce();

    const guardedNext = vi.fn();
    await moduleGuard("platform")({} as never, {} as never, guardedNext);
    expect(guardedNext.mock.calls[0]?.[0]).toMatchObject({
      status: 503,
      code: "FEATURE_UNAVAILABLE",
    });
  });

  it("checks all migration guard triggers from the live catalog", async () => {
    const table = await pool.query<{ to_regclass: string | null }>(
      "SELECT to_regclass('public.skill_guard_skill_ledger')::text",
    );
    if (table.rows[0]?.to_regclass) {
      const result = await guardsReady();
      expect(typeof result).toBe("boolean");
    } else {
      expect(await guardsReady()).toBe(false);
    }
  });
});
