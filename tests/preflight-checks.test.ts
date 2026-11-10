import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function preflight(overrides: Record<string, string>) {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "production",
    DATABASE_URL: "",
    AUTH_APP_ORIGIN: "https://app.example.test",
    SESSION_SECRET: "disposable-preflight-key-at-least-32-characters",
    SUPABASE_URL: "",
    SUPABASE_PUBLISHABLE_KEY: "",
    SUPABASE_SECRET_KEY: "",
    REPOSITORY_ROOT: "",
    INTELLIGENCE_ENABLED: "false",
    INTELLIGENCE_AI_MODEL: "",
    ...overrides,
  };
  let stdout: string;
  try {
    stdout = execFileSync(
      process.execPath,
      ["artifacts/api-server/scripts/preflight.mjs"],
      { env, encoding: "utf8" },
    );
  } catch (error) {
    stdout = (error as { stdout: string }).stdout;
  }
  return JSON.parse(stdout) as { results: { check: string; ok: boolean }[] };
}

const identity = {
  SUPABASE_URL: "https://fixture.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "public-test",
  SUPABASE_SECRET_KEY: "disposable-test",
};

describe("production preflight configuration", () => {
  it("requires the web proxy client-address secret", () => {
    const name = "Web proxy client-address secret configured";
    expect(
      preflight({ ...identity, PROXY_SHARED_SECRET: "" }).results,
    ).toContainEqual({ check: name, ok: false });
    expect(
      preflight({ ...identity, PROXY_SHARED_SECRET: "p".repeat(32) }).results,
    ).toContainEqual({ check: name, ok: true });
  });
  it("requires an HTTPS R2 endpoint with both credentials", () => {
    const name = "R2 object storage credentials";
    const r2 = {
      R2_ENDPOINT: "https://0123456789abcdef.r2.cloudflarestorage.com",
      R2_ACCESS_KEY_ID: "disposable-key-id",
      R2_SECRET_ACCESS_KEY: "disposable-secret",
    };
    expect(preflight({ ...identity, ...r2 }).results).toContainEqual({
      check: name,
      ok: true,
    });
    for (const patch of [
      { R2_ENDPOINT: "http://0123456789abcdef.r2.cloudflarestorage.com" },
      { R2_ENDPOINT: "https://example.test/bucket" },
      { R2_ACCESS_KEY_ID: "" },
      { R2_SECRET_ACCESS_KEY: "" },
    ])
      expect(
        preflight({ ...identity, ...r2, ...patch }).results,
      ).toContainEqual({ check: name, ok: false });
  });
  it("rejects a configured storage namespace that cannot promote uploads", () => {
    expect(
      preflight({ ...identity, PRIVATE_OBJECT_DIR: "/bucket" }).results,
    ).toContainEqual({ check: "Private object storage namespace", ok: false });
  });
  it("accepts a canonical storage namespace without claiming bucket readiness", () => {
    expect(
      preflight({ ...identity, PRIVATE_OBJECT_DIR: "/bucket/private" }).results,
    ).toContainEqual({ check: "Private object storage namespace", ok: true });
  });
  it("does not leave product-schema verification absent when the database is unavailable", () => {
    expect(preflight(identity).results).toContainEqual({
      check: "Required product schema",
      ok: false,
    });
  });
  it("accepts complete Supabase identity configuration", () => {
    expect(preflight(identity).results).toContainEqual({
      check: "Managed identity configuration",
      ok: true,
    });
  });
  it.each([
    { SUPABASE_URL: "" },
    { SUPABASE_URL: "http://fixture.supabase.co" },
    { SUPABASE_URL: "https://evil.example" },
    { SUPABASE_SECRET_KEY: "" },
  ])("rejects incomplete or foreign identity configuration %j", (patch) => {
    expect(preflight({ ...identity, ...patch }).results).toContainEqual({
      check: "Managed identity configuration",
      ok: false,
    });
  });
});
