import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig } from "vitest/config";
import base from "../vitest.config";

const frontend = fileURLToPath(
  new URL("../artifacts/proofstack/", import.meta.url),
);

export default mergeConfig(
  base,
  defineConfig({
    resolve: {
      alias: [
        {
          find: "@/components/ui",
          replacement: `${frontend}src/components/ui`,
        },
        { find: "@", replacement: frontend },
      ],
    },
    esbuild: { jsx: "automatic" },
  }),
);
