import { rmSync } from "node:fs";
import { resolve } from "node:path";

// Keep alternate lockfiles from competing with the checked-in pnpm lockfile.
for (const name of ["package-lock.json", "yarn.lock"]) {
  rmSync(resolve(process.cwd(), name), { force: true });
}

if (!process.env.npm_config_user_agent?.startsWith("pnpm/")) {
  console.error("Use pnpm instead");
  process.exitCode = 1;
}
