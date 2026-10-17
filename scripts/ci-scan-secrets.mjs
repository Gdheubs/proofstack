import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

// Official v8.30.1 checksums were fetched and verified during the local audit.
const version = "8.30.1";
const sha256 =
  "551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb";
async function main() {
  if (process.platform !== "linux" || process.arch !== "x64")
    throw new Error(
      "This CI scanner requires Linux x64; use the documented checksum-verified native scanner for local Windows audits",
    );
  const folder = path.resolve(".local/ci-secret-scan");
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const archive = path.join(folder, "gitleaks.tar.gz");
  const response = await fetch(
    `https://github.com/gitleaks/gitleaks/releases/download/v${version}/gitleaks_${version}_linux_x64.tar.gz`,
    { signal: AbortSignal.timeout(60000) },
  );
  if (!response.ok || !response.body)
    throw new Error("Cannot download the pinned scanner");
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    if (size > 32 * 1024 * 1024)
      throw new Error("Scanner archive exceeded its byte budget");
    chunks.push(Buffer.from(chunk));
  }
  const bytes = Buffer.concat(chunks);
  if (createHash("sha256").update(bytes).digest("hex") !== sha256)
    throw new Error("Scanner checksum mismatch; refusing execution");
  await writeFile(archive, bytes, { mode: 0o600 });
  const unpack = spawnSync("tar", ["-xzf", archive, "-C", folder, "gitleaks"], {
    shell: false,
    stdio: "pipe",
  });
  if (unpack.error || unpack.status !== 0)
    throw new Error("Cannot unpack the verified scanner");
  const report = path.join(folder, "history.redacted.json");
  const scan = spawnSync(
    path.join(folder, "gitleaks"),
    [
      "git",
      ".",
      "--config",
      ".gitleaks.toml",
      "--redact=100",
      "--report-format=json",
      `--report-path=${report}`,
      "--no-banner",
    ],
    { shell: false, stdio: "pipe", maxBuffer: 8 * 1024 * 1024 },
  );
  if (scan.error || ![0, 1].includes(scan.status))
    throw new Error("Secret scanner did not complete; gate failed");
  const findings = JSON.parse(await readFile(report, "utf8"));
  console.log(
    `Gitleaks ${version}: ${findings.length} unreviewed history finding(s); all report values are redacted`,
  );
  process.exitCode = scan.status;
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
