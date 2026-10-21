import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Fails when the Cloudflare Worker built by `cf:build` would exceed the plan's
// compressed size limit (Workers Free: 3 MiB; Paid: 10 MiB). Wrangler's own
// dry run reports the gzip size Cloudflare enforces; nothing is uploaded.
export function parseUploadSize(output) {
  const match =
    /Total Upload:\s*([\d.]+)\s*KiB\s*\/\s*gzip:\s*([\d.]+)\s*KiB/.exec(output);
  return match ? { raw: Number(match[1]), gzip: Number(match[2]) } : null;
}

export function checkWorkerSize(app, limitKiB) {
  // wrangler's package exports hide its bin; use the app's own dependency link.
  const wrangler = path.join(
    app,
    "node_modules",
    "wrangler",
    "bin",
    "wrangler.js",
  );
  if (!existsSync(wrangler))
    return { ok: false, message: "wrangler is not installed for this app" };
  const outdir = mkdtempSync(path.join(tmpdir(), "worker-size-"));
  try {
    const run = spawnSync(
      process.execPath,
      [wrangler, "deploy", "--dry-run", "--outdir", outdir],
      { cwd: app, encoding: "utf8", shell: false, maxBuffer: 16 * 1024 * 1024 },
    );
    const size = parseUploadSize(`${run.stdout}\n${run.stderr}`);
    if (run.status !== 0 || !size)
      return { ok: false, message: "Wrangler dry run did not report a size" };
    const headroom = limitKiB - size.gzip;
    return {
      ok: headroom >= 0,
      message: `Worker gzip ${size.gzip.toFixed(0)} KiB of ${limitKiB} KiB (${
        headroom >= 0
          ? `${headroom.toFixed(0)} KiB headroom`
          : `${(-headroom).toFixed(0)} KiB over`
      })`,
    };
  } finally {
    rmSync(outdir, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  import.meta.url.endsWith(path.basename(process.argv[1]))
) {
  const app = path.resolve(process.argv[2] ?? "artifacts/proofstack");
  const limit = Number(process.env.WORKER_GZIP_LIMIT_KIB ?? 3072);
  const result = checkWorkerSize(app, limit);
  (result.ok ? console.info : console.error)(result.message);
  process.exitCode = result.ok ? 0 : 1;
}
