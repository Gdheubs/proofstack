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
    FIREBASE_WEB_CONFIG_FILE: "",
    ...overrides,
  };
  delete env.FIREBASE_AUTH_EMULATOR_HOST;
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

const firebase = {
  AUTH_PROVIDER: "firebase",
  FIREBASE_PROJECT_ID: "preflight-test",
  FIREBASE_WEB_PROJECT_ID: "preflight-test",
  FIREBASE_WEB_API_KEY: "public-disposable-test-value",
  FIREBASE_WEB_AUTH_DOMAIN: "preflight-test.firebaseapp.com",
  FIREBASE_WEB_APP_ID: "public-disposable-app-id",
  FIREBASE_GOOGLE_ENABLED: "true",
  FIREBASE_GITHUB_ENABLED: "false",
  FIREBASE_TOTP_ENABLED: "false",
};

describe("production preflight provider selection", () => {
  it("requires the web proxy client-address secret", () => {
    const name = "Web proxy client-address secret configured";
    expect(
      preflight({ ...firebase, PROXY_SHARED_SECRET: "" }).results,
    ).toContainEqual({ check: name, ok: false });
    expect(
      preflight({ ...firebase, PROXY_SHARED_SECRET: "p".repeat(32) }).results,
    ).toContainEqual({ check: name, ok: true });
  });
  it("rejects a configured storage namespace that cannot promote uploads", () => {
    expect(
      preflight({ ...firebase, PRIVATE_OBJECT_DIR: "/bucket" }).results,
    ).toContainEqual({ check: "Private object storage namespace", ok: false });
  });
  it("accepts a canonical storage namespace without claiming bucket readiness", () => {
    expect(
      preflight({ ...firebase, PRIVATE_OBJECT_DIR: "/bucket/private" }).results,
    ).toContainEqual({ check: "Private object storage namespace", ok: true });
  });
  it("does not leave product-schema verification absent when the database is unavailable", () => {
    expect(preflight(firebase).results).toContainEqual({
      check: "Required product schema",
      ok: false,
    });
  });
  it("accepts configured Firebase identity without requiring Supabase credentials", () => {
    expect(preflight(firebase).results).toContainEqual({
      check: "Managed identity configuration",
      ok: true,
    });
  });
  it("rejects an unknown provider instead of accepting legacy credentials", () => {
    expect(
      preflight({
        AUTH_PROVIDER: "unknown",
        SUPABASE_URL: "https://fixture.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: "public-test",
        SUPABASE_SECRET_KEY: "disposable-test",
      }).results,
    ).toContainEqual({ check: "Managed identity configuration", ok: false });
  });
  it("rejects a mismatched Firebase web project", () => {
    expect(
      preflight({ ...firebase, FIREBASE_WEB_PROJECT_ID: "another-project" })
        .results,
    ).toContainEqual({ check: "Managed identity configuration", ok: false });
  });
});
