import { defineConfig, mergeConfig } from "vitest/config";
import base from "./vitest.config";

// This is a measured unit baseline, not a replacement for native SQL/browser tests.
// Keep unimported code visible. Critical policy boundaries have explicit gates;
// other modules are reported, not silently excluded to inflate the percentage.
const critical = [
  "artifacts/api-server/src/services/auth-input.ts",
  "artifacts/api-server/src/services/auth-policy.ts",
  "artifacts/api-server/src/services/community-policy.ts",
  "artifacts/api-server/src/services/careers-policy.ts",
  "artifacts/api-server/src/services/pull-policy.ts",
  "artifacts/proofstack/lib/security.ts",
  "artifacts/proofstack/lib/auth-return.ts",
];

export default mergeConfig(
  base,
  defineConfig({
    test: {
      exclude: ["**/*.integration.test.ts"],
      // Bound instrumentation contention without raising test deadlines.
      maxWorkers: 2,
      coverage: {
        enabled: true,
        provider: "v8",
        include: [
          "artifacts/api-server/src/**/*.ts",
          ...critical,
          "artifacts/proofstack/lib/navigation.ts",
        ],
        exclude: [
          "artifacts/api-server/src/index.ts",
          "artifacts/api-server/src/intelligence-worker.ts",
        ],
        reporter: ["text", "json", "json-summary", "lcov"],
        reportsDirectory: ".local/production-audit/coverage",
        reportOnFailure: true,
        thresholds: {
          autoUpdate: false,
          ...Object.fromEntries(
            critical.map((path) => [
              path,
              {
                perFile: true,
                statements: 80,
                lines: 80,
                functions: 80,
                branches: 75,
              },
            ]),
          ),
        },
      },
    },
  }),
);
