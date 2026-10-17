import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import base from "../vitest.config";

const critical = [
  "artifacts/api-server/src/services/auth-input.ts",
  "artifacts/api-server/src/services/auth-policy.ts",
  "artifacts/api-server/src/services/community-policy.ts",
  "artifacts/api-server/src/services/careers-policy.ts",
  "artifacts/api-server/src/services/pull-policy.ts",
  "artifacts/proofstack/lib/security.ts",
  "artifacts/proofstack/lib/auth-return.ts",
];

describe("measured coverage policy", () => {
  it("bounds instrumented workers without weakening test deadlines or coverage scope", async () => {
    const { default: config } = await import("../vitest.coverage.config");
    expect(config.test?.maxWorkers).toBe(2);
    expect(config.test?.testTimeout).toBe(base.test?.testTimeout);
    expect(config.test?.include).toEqual(base.test?.include);
  });

  it("keeps unimported critical boundaries in the denominator and enforces per-file minimums", async () => {
    const { default: config } = await import("../vitest.coverage.config");
    const coverage = config.test?.coverage;
    expect(coverage?.provider).toBe("v8");
    expect(coverage?.enabled).toBe(true);
    expect(coverage?.reporter).toEqual(
      expect.arrayContaining(["text", "json", "json-summary", "lcov"]),
    );
    for (const path of critical) {
      expect(coverage?.include).toContain(path);
      expect(coverage?.thresholds?.[path]).toEqual({
        perFile: true,
        statements: 80,
        lines: 80,
        functions: 80,
        branches: 75,
      });
    }
    expect(coverage?.thresholds?.autoUpdate).toBe(false);
    expect(coverage?.reportOnFailure).toBe(true);
    // Unit measurement is safe by default; native DB/provider integration is separate.
    expect(config.test?.exclude).toContain("**/*.integration.test.ts");
    expect(coverage?.include).toContain("artifacts/api-server/src/**/*.ts");
    expect(config.test?.include).toEqual(base.test?.include);
  });

  it("pins the coverage provider to the installed Vitest version and runs the CI gate", () => {
    const pkg = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    );
    expect(pkg.devDependencies["@vitest/coverage-v8"]).toBe("5.0.3");
    expect(pkg.scripts["test:coverage"]).toBe(
      "vitest run --config vitest.coverage.config.ts",
    );
    const workflow = readFileSync(
      new URL("../.github/workflows/ci.yml", import.meta.url),
      "utf8",
    );
    expect(workflow).toContain("run: pnpm test:coverage");
    expect(workflow).toContain("run: pnpm test:all");
  });
});
