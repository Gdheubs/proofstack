// Read-only checks. Run with the exact deployment environment after schema publish.
import pg from "pg";
import { access, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { isAbsolute } from "node:path";
const results = [];
const check = (name, ok) => results.push({ check: name, ok: Boolean(ok) });
const httpsOrigin = (value) => {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && u.origin === value;
  } catch {
    return false;
  }
};
check("Production runtime", process.env.NODE_ENV === "production");
check("HTTPS application origin", httpsOrigin(process.env.AUTH_APP_ORIGIN));
check(
  "Managed identity configuration",
  httpsOrigin(process.env.SUPABASE_URL) &&
    process.env.SUPABASE_PUBLISHABLE_KEY &&
    process.env.SUPABASE_SECRET_KEY,
);
check(
  "Session encryption secret configured",
  (process.env.SESSION_SECRET?.length ?? 0) >= 32,
);
check(
  "Maintenance disabled for traffic",
  process.env.MAINTENANCE_MODE !== "true",
);
for (const name of [
  "INTELLIGENCE_ENABLED",
  "MAINTENANCE_MODE",
  "AUTH_EMAIL_SMTP_READY",
  "AUTH_PHONE_MFA_READY",
]) {
  check(
    `${name} is a boolean flag`,
    !process.env[name] || ["true", "false"].includes(process.env[name]),
  );
}
if (process.env.REPOSITORY_ROOT) {
  try {
    const root = process.env.REPOSITORY_ROOT;
    const info = await stat(root);
    await access(root, constants.R_OK | constants.W_OK | constants.X_OK);
    check(
      "Private accessible absolute Git directory",
      isAbsolute(root) && info.isDirectory() && (info.mode & 0o077) === 0,
    );
  } catch {
    check("Private accessible absolute Git directory", false);
  }
}
if (process.env.INTELLIGENCE_AI_MODEL) {
  let secure = false;
  try {
    secure =
      new URL(process.env.AI_INTEGRATIONS_OPENAI_BASE_URL).protocol ===
      "https:";
  } catch {}
  check(
    "AI provider configuration",
    secure &&
      process.env.AI_INTEGRATIONS_OPENAI_API_KEY &&
      process.env.INTELLIGENCE_ENABLED === "true",
  );
}
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  connectionTimeoutMillis: 5000,
  statement_timeout: 5000,
  query_timeout: 6000,
});
pool.on("error", () => {});
try {
  if (!process.env.DATABASE_URL) throw new Error("Missing database");
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    const tables = [
      "users",
      "sessions",
      "community_projects",
      "career_jobs",
      "repositories",
      "repository_pull_requests",
      "intelligence_jobs",
      "service_heartbeats",
    ];
    const rows = await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name=ANY($1::text[])",
      [tables],
    );
    check("Required product tables", rows.rows.length === tables.length);
    const indexes = [
      "service_heartbeat_seen_idx",
      "community_projects_created_idx",
      "intelligence_finished_idx",
    ];
    const found = await client.query(
      "SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname=ANY($1::text[])",
      [indexes],
    );
    check("Phase 7 indexes", found.rows.length === indexes.length);
    if (process.env.INTELLIGENCE_ENABLED === "true") {
      const heartbeat = await client.query(
        "SELECT 1 FROM service_heartbeats WHERE service='intelligence' AND last_seen_at>now()-interval '180 seconds' LIMIT 1",
      );
      check(
        "Recent intelligence worker heartbeat",
        heartbeat.rows.length === 1,
      );
    }
    await client.query("ROLLBACK");
  } finally {
    client.release();
  }
} catch {
  check("Database inspection succeeded", false);
} finally {
  await pool.end();
}
console.log(
  JSON.stringify(
    {
      results,
      note: "Configuration/schema checks only. Provider delivery, proxy trust, complete schema diff, durable storage, backup restore and browser acceptance require staging verification.",
    },
    null,
    2,
  ),
);
process.exitCode = results.every((r) => r.ok) ? 0 : 1;
