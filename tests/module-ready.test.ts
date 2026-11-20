import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  featureConfigurationReady,
  guardsReady,
  mediaCleanupSchemaReady,
  mediaProcessorReady,
  moduleReadySync,
  refreshModule,
  resetModuleReadiness,
} from "../artifacts/api-server/src/services/module-ready";
import { moduleGuard } from "../artifacts/api-server/src/middlewares/module-guard";

const ok = async () => ({ rows: [{ healthy: true }] });
const absent = async () => ({ rows: [{ healthy: false }] });

beforeEach(() => {
  resetModuleReadiness();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("module readiness", () => {
  it("fails closed before a module has been checked", () => {
    expect(moduleReadySync("platform")).toBe(false);
  });

  it("never treats an empty module as ready", async () => {
    const query = vi.fn(ok);
    expect(await refreshModule("distribution", query)).toBe(false);
    expect(query).not.toHaveBeenCalled();
    expect(moduleReadySync("distribution")).toBe(false);
  });

  it("caches ready for five minutes and missing for five seconds", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const present = vi.fn(ok);
    expect(await refreshModule("platform", present)).toBe(true);
    expect(moduleReadySync("platform")).toBe(true);
    vi.advanceTimersByTime(299_999);
    expect(await refreshModule("platform", present)).toBe(true);
    expect(present).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(moduleReadySync("platform")).toBe(false);
    expect(await refreshModule("platform", present)).toBe(true);
    expect(present).toHaveBeenCalledTimes(2);

    resetModuleReadiness();
    const missing = vi.fn(absent);
    expect(await refreshModule("platform", missing)).toBe(false);
    vi.advanceTimersByTime(4_999);
    expect(await refreshModule("platform", missing)).toBe(false);
    expect(missing).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(await refreshModule("platform", missing)).toBe(false);
    expect(missing).toHaveBeenCalledTimes(2);
  });

  it("requires both an enabled area flag and ready dependency modules", async () => {
    await refreshModule("platform", ok);
    vi.stubEnv("PLATFORM_ACCESS_ENABLED", "true");
    vi.stubEnv("SKILL_KEY_RING", `current:${"k".repeat(40)}`);
    vi.stubEnv("LEDGER_PSEUDONYM_SECRET", "p".repeat(40));
    const next = vi.fn();
    await moduleGuard("platform")({} as never, {} as never, next);
    expect(next).toHaveBeenCalledWith();

    vi.stubEnv("PLATFORM_ACCESS_ENABLED", "false");
    const disabled = vi.fn();
    await moduleGuard("platform")({} as never, {} as never, disabled);
    expect(disabled.mock.calls[0]?.[0]).toMatchObject({
      status: 503,
      code: "FEATURE_UNAVAILABLE",
    });
  });

  it("returns a generic unavailable error while key configuration is missing", async () => {
    await refreshModule("platform", ok);
    vi.stubEnv("PLATFORM_ACCESS_ENABLED", "true");
    vi.stubEnv("SKILL_KEY_RING", "bad");
    vi.stubEnv("LEDGER_PSEUDONYM_SECRET", "p".repeat(40));
    const next = vi.fn();
    await moduleGuard("platform")({} as never, {} as never, next);
    expect(next.mock.calls[0]?.[0]).toMatchObject({
      status: 503,
      code: "FEATURE_UNAVAILABLE",
    });
    expect(next.mock.calls[0]?.[0]?.message).not.toContain("bad");
  });

  it("requires feature consent text versions before enabling recording and AI", () => {
    for (const [area, flag] of [
      ["recorded", "SKILLS_RECORDED_ENABLED"],
      ["interview", "SKILLS_INTERVIEW_ENABLED"],
      ["voice", "SKILLS_VOICE_ENABLED"],
    ] as const) {
      vi.stubEnv(flag, "true");
      vi.stubEnv("SKILL_KEY_RING", `current:${"k".repeat(40)}`);
      vi.stubEnv("CONSENT_RECORDING_VERSION", "");
      vi.stubEnv("CONSENT_AI_EVALUATION_VERSION", "");
      vi.stubEnv("CONSENT_INTEGRITY_MONITORING_VERSION", "");
      vi.stubEnv("MEDIA_ORIGIN", "");
      vi.stubEnv("EVIDENCE_OBJECT_DIR", "");
      vi.stubEnv("EVIDENCE_R2_ACCESS_KEY_ID", "");
      vi.stubEnv("EVIDENCE_R2_SECRET_ACCESS_KEY", "");
      vi.stubEnv("MEDIA_PROCESSOR_ENABLED", "");
      vi.stubEnv("AI_MODEL_SPEECH", "");
      expect(featureConfigurationReady(area)).toBe(false);
      vi.stubEnv("CONSENT_RECORDING_VERSION", "recording-v1");
      vi.stubEnv("CONSENT_AI_EVALUATION_VERSION", "ai-v1");
      vi.stubEnv("CONSENT_INTEGRITY_MONITORING_VERSION", "integrity-v1");
      if (area === "voice") {
        vi.stubEnv("AI_MODEL_SPEECH", "speech-model");
        expect(featureConfigurationReady(area)).toBe(false);
      }
      if (area === "recorded" || area === "voice") {
        vi.stubEnv("MEDIA_ORIGIN", "https://media.example.test");
        vi.stubEnv("EVIDENCE_OBJECT_DIR", "/bucket/evidence");
        vi.stubEnv("EVIDENCE_R2_ACCESS_KEY_ID", "key-id");
        vi.stubEnv("EVIDENCE_R2_SECRET_ACCESS_KEY", "secret-key");
        vi.stubEnv("MEDIA_PROCESSOR_ENABLED", "true");
      }
      expect(featureConfigurationReady(area)).toBe(true);
    }
  });

  it("requires the named enabled guard trigger on its expected table", async () => {
    const wrongTable = vi.fn(async (_sql: string, _values: unknown[]) => ({
      rows: [{ ready: false }],
    }));
    expect(await guardsReady(wrongTable)).toBe(false);
    expect(wrongTable.mock.calls[0]?.[0]).toContain("t.tgrelid=e.table_oid");
    expect(wrongTable.mock.calls[0]?.[0]).toContain("t.tgenabled IN ('O','A')");

    const disabled = vi.fn(async (_sql: string, _values: unknown[]) => ({
      rows: [{ ready: false }],
    }));
    expect(await guardsReady(disabled)).toBe(false);
    expect(disabled.mock.calls[0]?.[1]).toEqual(wrongTable.mock.calls[0]?.[1]);
  });

  it("requires a fresh media processor heartbeat and fails closed on query errors", async () => {
    const fresh = vi.fn(async (_sql: string, _values: unknown[]) => ({
      rows: [{ ready: true }],
    }));
    expect(await mediaProcessorReady(fresh)).toBe(true);
    expect(fresh.mock.calls[0]?.[0]).toContain("interval '180 seconds'");
    expect(
      await mediaProcessorReady(async () => ({ rows: [{ ready: false }] })),
    ).toBe(false);
    expect(
      await mediaProcessorReady(async () => {
        throw new Error("db detail");
      }),
    ).toBe(false);
  });

  it("reprobes present media schema even after a cached absent result", async () => {
    await refreshModule("media", async () => ({ rows: [{ healthy: false }] }));
    const query = vi.fn(async (_sql: string) => ({
      rows: [{ present: true, healthy: false }],
    }));
    expect(await mediaCleanupSchemaReady(query)).toBe("unavailable");
    expect(query).toHaveBeenCalledTimes(2);
  });
});
