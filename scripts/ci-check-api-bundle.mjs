import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

// Starts the built API exactly as the host does (node dist/index.mjs) and
// fails unless it reaches "Server listening" and answers /api/healthz. Catches
// bundling faults (module order, missing externals) that unit tests never see,
// because they import the TypeScript sources instead of the bundle.
const app = path.resolve(process.argv[2] ?? "artifacts/api-server");
const entry = path.join(app, "dist", "index.mjs");
if (!existsSync(entry)) {
  console.error(`Missing ${entry}; run the API build first`);
  process.exit(1);
}
const port = 18080 + Math.floor(Math.random() * 1000);
const child = spawn(process.execPath, ["--enable-source-maps", entry], {
  cwd: app,
  env: {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(port),
    BIND_HOST: "127.0.0.1",
    // A database that is never reached: health does not need it.
    DATABASE_URL:
      process.env.DATABASE_URL ??
      "postgresql://smoke:smoke@127.0.0.1:1/smoke?sslmode=disable",
    SESSION_SECRET: "bundle-smoke-test-secret-at-least-32-characters",
    AUTH_APP_ORIGIN: "https://smoke.example.test",
    LOG_LEVEL: "info",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
const collect = (chunk) => {
  output += chunk;
};
child.stdout.on("data", collect);
child.stderr.on("data", collect);

const finish = (ok, message) => {
  child.kill("SIGTERM");
  (ok ? console.info : console.error)(message);
  if (!ok) console.error(output.slice(-4000));
  process.exit(ok ? 0 : 1);
};
child.on("exit", (code) =>
  finish(false, `API bundle exited with code ${code} before serving`),
);

const deadline = Date.now() + 30000;
const poll = async () => {
  if (Date.now() > deadline)
    return finish(false, "API bundle did not listen within 30 s");
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/healthz`);
    if (res.ok && (await res.json()).status === "ok")
      return finish(
        true,
        `API bundle started and answered /api/healthz on ${port}`,
      );
  } catch {
    // not up yet
  }
  setTimeout(poll, 500);
};
setTimeout(poll, 500);
