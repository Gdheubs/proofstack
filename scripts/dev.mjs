import { accessSync, constants, existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { resolveDevConfiguration } from "./dev-config.mjs";
import { verifyApiReadiness } from "./dev-health.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const children = new Set();
let stopping = false;

async function terminate(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === "win32") {
    // Only task-owned numeric child PIDs, never a shell or a name-wide kill.
    spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      shell: false,
    });
  } else {
    child.kill("SIGTERM");
    await Promise.race([
      once(child, "exit").catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]);
    if (child.exitCode === null && child.signalCode === null)
      child.kill("SIGKILL");
  }
}
async function stop(code) {
  if (stopping) return;
  stopping = true;
  await Promise.all([...children].map(terminate));
  process.exitCode = code;
}
function start(label, args, cwd, env) {
  const child = spawn(process.execPath, args, {
    cwd,
    env,
    stdio: "inherit",
    shell: false,
  });
  children.add(child);
  child.on("error", () => {
    console.error(`${label} could not start`);
    void stop(1);
  });
  child.once("exit", (code) => {
    children.delete(child);
    if (!stopping) {
      console.error(`${label} exited; stopping the full development stack`);
      void stop(code || 1);
    }
  });
  return child;
}
async function main() {
  process.chdir(root);
  const envFile = join(root, ".env.local");
  if (existsSync(envFile)) {
    try {
      loadEnvFile(envFile);
    } catch {
      throw new Error("Cannot load development .env.local");
    }
  }
  const config = resolveDevConfiguration(process.env);
  for (const [field, file] of [
    ["DEV_TLS_KEY_FILE", config.tlsKeyFile],
    ["DEV_TLS_CERT_FILE", config.tlsCertFile],
    ...(config.env.AUTH_PROVIDER === "firebase"
      ? [
          [
            "GOOGLE_APPLICATION_CREDENTIALS",
            config.env.GOOGLE_APPLICATION_CREDENTIALS,
          ],
        ]
      : []),
  ]) {
    try {
      accessSync(file, constants.R_OK);
    } catch {
      throw new Error(`Development file is unavailable: ${field}`);
    }
  }
  if (process.argv.includes("--check")) {
    console.log(
      "Development configuration is valid; no services started and no secret values displayed.",
    );
    return;
  }
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, () => {
      console.log("Stopping development stack");
      void stop(0);
    });
  const apiFolder = join(root, "artifacts/api-server");
  const build = spawnSync(process.execPath, ["build.mjs"], {
    cwd: apiFolder,
    env: config.env,
    stdio: "inherit",
    shell: false,
  });
  if (build.error || build.status !== 0)
    throw new Error("API build failed; the frontend was not started");
  const api = start(
    "API",
    ["--enable-source-maps", "dist/index.mjs"],
    apiFolder,
    { ...config.env, PORT: String(config.apiPort) },
  );
  const deadline = Date.now() + 30000;
  let ready = false;
  let diagnostic = "API startup";
  while (!stopping && api.exitCode === null && Date.now() < deadline) {
    try {
      await verifyApiReadiness(config.env.API_INTERNAL_ORIGIN);
      ready = true;
      break;
    } catch (error) {
      diagnostic = error.message;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready || stopping) throw new Error(diagnostic);
  if (config.env.INTELLIGENCE_ENABLED === "true")
    start(
      "Intelligence worker",
      ["--enable-source-maps", "dist/intelligence-worker.mjs"],
      apiFolder,
      config.env,
    );
  const frontend = join(root, "artifacts/proofstack");
  start(
    "Web",
    [
      "node_modules/next/dist/bin/next",
      "dev",
      "--webpack",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(config.webPort),
      "--experimental-https",
      "--experimental-https-key",
      config.tlsKeyFile,
      "--experimental-https-cert",
      config.tlsCertFile,
    ],
    frontend,
    { ...config.webEnv, PORT: String(config.webPort) },
  );
  console.log(
    `API and database/auth probes passed. Starting full-stack development at ${config.env.AUTH_APP_ORIGIN}`,
  );
  console.log(
    "Local TLS certificate trust is user-managed; this command never changes the OS trust store.",
  );
}

main().catch(async (error) => {
  // All errors reaching here have bounded field/stage messages, not secret values.
  console.error(error.message);
  await stop(1);
});
