import { spawnSync } from "node:child_process";

// Compare only the Orval output trees. Never read .env files or reset changes.
const result = spawnSync(
  "git",
  [
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
    "--",
    "lib/api-client-react/src/generated",
    "lib/api-zod/src/generated",
  ],
  { cwd: process.argv[2] ?? process.cwd(), encoding: "utf8" },
);

if (result.error || result.status !== 0) {
  console.error("Cannot verify generated output: Git status failed.");
  process.exitCode = 1;
} else if (result.stdout.trim()) {
  console.error(
    "Generated API output drifted. Regenerate and review the output before merging:",
  );
  console.error(result.stdout.trimEnd());
  process.exitCode = 1;
} else {
  console.info("Generated API output matches the Git index.");
}
