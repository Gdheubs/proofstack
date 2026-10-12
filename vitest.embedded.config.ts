import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^pg$/,
        replacement: fileURLToPath(
          new URL("./lib/db/node_modules/pg/lib/index.js", import.meta.url),
        ),
      },
    ],
  },
  test: {
    environment: "node",
    include: [
      "tests/**/*.integration.test.ts",
      "lib/db/tests/**/*.integration.test.ts",
    ],
    setupFiles: ["./tests/setup.ts", "./tests/embedded-db.ts"],
    pool: "forks",
    isolate: true,
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 15000,
    hookTimeout: 30000,
  },
});
