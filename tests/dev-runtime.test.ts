import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const modulePath = `${process.cwd()}/scripts/dev-config.mjs`;
const base = {
  DATABASE_URL: "postgresql://postgres@127.0.0.1:55432/proofstack_dev",
  AUTH_APP_ORIGIN: "https://localhost:3011",
  SESSION_SECRET_FILE: "external-session-secret",
  SUPABASE_URL: "https://fixture.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "public-test-only",
  SUPABASE_SECRET_KEY: "disposable-test-only",
  DEV_TLS_KEY_FILE: "external-local-tls-key",
  DEV_TLS_CERT_FILE: "external-local-tls-cert",
};
const contents: Record<string, string> = {
  "external-session-secret":
    "disposable-test-session-secret-32-or-more-characters\n",
};

it("has a single full-stack development entry point rather than starting the frontend alone", () => {
  const manifest = JSON.parse(readFileSync("package.json", "utf8"));
  expect(manifest.scripts.dev).toBe("node scripts/dev.mjs");
});

describe("full-stack local development configuration", () => {
  it("loads an existing external session secret in memory", async () => {
    const { resolveDevConfiguration } = await import(modulePath);
    const config = resolveDevConfiguration(
      base,
      (path: string) => contents[path],
    );
    expect(config.webPort).toBe(3011);
    expect(config.apiPort).toBe(8089);
    expect(config.env.API_INTERNAL_ORIGIN).toBe("http://127.0.0.1:8089");
    expect(config.env.SESSION_SECRET).toBe(
      contents["external-session-secret"].trimEnd(),
    );
    expect(config.env.BIND_HOST).toBe("127.0.0.1");
    expect(base).not.toHaveProperty("SESSION_SECRET");
  });
  it("does not pass database, session or provider secrets to the frontend process", async () => {
    const { resolveDevConfiguration } = await import(modulePath);
    const config = resolveDevConfiguration(
      { ...base, PATH: "test-path" },
      (path: string) => contents[path],
    );
    expect(config.webEnv).toEqual(
      expect.objectContaining({
        API_INTERNAL_ORIGIN: "http://127.0.0.1:8089",
        PATH: "test-path",
      }),
    );
    for (const key of [
      "DATABASE_URL",
      "SESSION_SECRET",
      "SESSION_SECRET_FILE",
      "SUPABASE_SECRET_KEY",
      "SUPABASE_PUBLISHABLE_KEY",
    ])
      expect(config.webEnv).not.toHaveProperty(key);
  });
  it.each([
    { NODE_ENV: "production" },
    { DATABASE_URL: "postgresql://remote.example/private" },
    { AUTH_APP_ORIGIN: "http://localhost:3011" },
    { AUTH_APP_ORIGIN: "https://localhost:9999" },
    { API_PORT: "3011" },
    { API_INTERNAL_ORIGIN: "http://127.0.0.1:9999" },
    { SUPABASE_URL: "http://fixture.supabase.co" },
    { SUPABASE_URL: "https://evil.example" },
    { SUPABASE_SECRET_KEY: "" },
    { INTELLIGENCE_ENABLED: "yes" },
    { DEV_TLS_KEY_FILE: "" },
  ])(
    "fails closed on unsafe or contradictory configuration %j",
    async (overrides) => {
      const { resolveDevConfiguration } = await import(modulePath);
      expect(() =>
        resolveDevConfiguration(
          { ...base, ...overrides },
          (path: string) => contents[path],
        ),
      ).toThrow();
    },
  );
  it("never includes failed secret-file contents or paths in diagnostics", async () => {
    const { resolveDevConfiguration } = await import(modulePath);
    expect(() =>
      resolveDevConfiguration(base, () => {
        throw new Error("sensitive-path-or-provider-value");
      }),
    ).toThrow("SESSION_SECRET_FILE");
    try {
      resolveDevConfiguration(base, () => {
        throw new Error("sensitive-path-or-provider-value");
      });
    } catch (error) {
      expect(String(error)).not.toContain("sensitive-path-or-provider-value");
    }
  });
});
