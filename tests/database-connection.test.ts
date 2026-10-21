import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { databasePoolOptions } from "../lib/db/src/pool-options";
// @ts-expect-error -- plain ESM operations script without type declarations
import { releaseTarget } from "../lib/db/scripts/migrate-release.mjs";

const neon =
  "postgresql://app:secret@ep-quiet-sky-123456.ap-southeast-1.aws.neon.tech/proofstack?sslmode=verify-full&channel_binding=require";

describe("database pool options", () => {
  it("uses Neon-friendly defaults and honours channel binding", () => {
    expect(databasePoolOptions({ DATABASE_URL: neon })).toMatchObject({
      connectionString: neon,
      max: 10,
      connectionTimeoutMillis: 10_000,
      enableChannelBinding: true,
    });
    expect(
      databasePoolOptions({
        DATABASE_URL: "postgresql://localhost/test",
        DATABASE_POOL_MAX: "5",
      }),
    ).toMatchObject({ max: 5, enableChannelBinding: false });
  });
  it.each(["0", "51", "2.5", "many"])("rejects pool size %s", (value) => {
    expect(() =>
      databasePoolOptions({ DATABASE_URL: neon, DATABASE_POOL_MAX: value }),
    ).toThrow("DATABASE_POOL_MAX");
  });
  it("rejects a missing or malformed URL without echoing it", () => {
    expect(() => databasePoolOptions({})).toThrow("DATABASE_URL must be set");
    try {
      databasePoolOptions({ DATABASE_URL: "not a url with secret-value" });
      expect.unreachable();
    } catch (error) {
      expect(String(error)).toContain("not a valid PostgreSQL URL");
      expect(String(error)).not.toContain("secret-value");
    }
  });
});

describe("release migration target guard", () => {
  const host = "ep-quiet-sky-123456.ap-southeast-1.aws.neon.tech";
  it("accepts only an explicitly confirmed direct host", () => {
    expect(
      releaseTarget({ DATABASE_URL: neon, MIGRATION_TARGET_HOST: host }),
    ).toBe(host);
  });
  it.each([
    [{ DATABASE_URL: neon }, "MIGRATION_TARGET_HOST"],
    [
      { DATABASE_URL: neon, MIGRATION_TARGET_HOST: "other.neon.tech" },
      "MIGRATION_TARGET_HOST",
    ],
    [
      {
        DATABASE_URL: neon.replace(
          "ep-quiet-sky-123456",
          "ep-quiet-sky-123456-pooler",
        ),
        MIGRATION_TARGET_HOST:
          "ep-quiet-sky-123456-pooler.ap-southeast-1.aws.neon.tech",
      },
      "direct (non-pooled)",
    ],
    [
      {
        DATABASE_URL: "postgresql://u:p@db.example.test:6543/postgres",
        MIGRATION_TARGET_HOST: "db.example.test",
      },
      "direct (non-pooled)",
    ],
    [
      {
        DATABASE_URL: "https://example.test",
        MIGRATION_TARGET_HOST: "example.test",
      },
      "PostgreSQL URL",
    ],
    [{ MIGRATION_TARGET_HOST: host }, "PostgreSQL URL"],
  ])("refuses %j", (env, message) => {
    expect(() => releaseTarget(env)).toThrow(message);
  });
});

describe("production preflight database checks", () => {
  function preflight(url: string) {
    let stdout: string;
    try {
      stdout = execFileSync(
        process.execPath,
        ["artifacts/api-server/scripts/preflight.mjs"],
        {
          env: { ...process.env, NODE_ENV: "production", DATABASE_URL: url },
          encoding: "utf8",
        },
      );
    } catch (error) {
      stdout = (error as { stdout: string }).stdout;
    }
    return (JSON.parse(stdout) as { results: { check: string; ok: boolean }[] })
      .results;
  }
  it.each([
    [neon, true, true],
    [
      neon.replace("ep-quiet-sky-123456", "ep-quiet-sky-123456-pooler"),
      false,
      true,
    ],
    [
      "postgresql://u:p@db.example.test:6543/postgres?sslmode=require",
      false,
      true,
    ],
    ["postgresql://u:p@db.example.test:5432/postgres", true, false],
  ])("evaluates %s", (url, direct, tls) => {
    const results = preflight(url);
    expect(results).toContainEqual({
      check: "Direct database endpoint",
      ok: direct,
    });
    expect(results).toContainEqual({ check: "Database TLS required", ok: tls });
  });
});
