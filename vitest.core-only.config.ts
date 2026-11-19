import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Core-only tests: the code runs against a database that holds the core
// migrations (0000 to 0021) and none of the module tables, as production
// does while a module migration waits for approval. A core-only test file is
// named *.core-only.test.ts and starts with
//   describe.skipIf(process.env.CORE_ONLY_DB !== "1")
// because the other configurations also match its name and would run it
// against a full database.
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
      "tests/**/*.core-only.test.ts",
      // Checks the harness itself: the core tables exist, no module table does.
      "tests/wiring-stubs.test.ts",
    ],
    setupFiles: ["./tests/setup.ts", "./tests/embedded-core-db.ts"],
    env: { CORE_ONLY_DB: "1" },
    pool: "forks",
    isolate: true,
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 15000,
    hookTimeout: 30000,
  },
});
