import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const frontend = fileURLToPath(
  new URL("./artifacts/proofstack/", import.meta.url),
);

export default defineConfig({
  resolve: {
    alias: [
      { find: "@/components/ui", replacement: `${frontend}src/components/ui` },
      { find: "@/lib/utils", replacement: `${frontend}src/lib/utils.ts` },
      {
        find: "@/hooks/use-toast",
        replacement: `${frontend}src/hooks/use-toast.ts`,
      },
      {
        find: "@/hooks/use-mobile",
        replacement: `${frontend}src/hooks/use-mobile.tsx`,
      },
      { find: "@", replacement: frontend },
    ],
  },
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "lib/db/tests/**/*.test.ts"],
    setupFiles: ["./tests/setup.ts"],
    pool: "forks",
    // Native files share global rate buckets and temporary DDL constraints.
    // Keep explicit within-test concurrent-client/worker races enabled.
    fileParallelism: process.env.RUN_DB_TESTS !== "1",
    isolate: true,
    testTimeout: 15000,
    hookTimeout: 15000,
  },
});
