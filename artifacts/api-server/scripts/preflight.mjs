// Read-only checks. Run with the exact deployment environment after schema publish.
import pg from "pg";
import { access, readFile, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { isAbsolute } from "node:path";
import {
  inspectCommunityGrants,
  inspectMigrationHistory,
  inspectProductSchema,
} from "./preflight-schema.mjs";
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
const provider = process.env.AUTH_PROVIDER ?? "supabase";
let identityConfigured = false;
if (provider === "supabase") {
  identityConfigured =
    httpsOrigin(process.env.SUPABASE_URL) &&
    new URL(process.env.SUPABASE_URL).hostname.endsWith(".supabase.co") &&
    Boolean(
      process.env.SUPABASE_PUBLISHABLE_KEY && process.env.SUPABASE_SECRET_KEY,
    );
} else if (provider === "firebase") {
  try {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const web = process.env.FIREBASE_WEB_CONFIG_FILE
      ? JSON.parse(await readFile(process.env.FIREBASE_WEB_CONFIG_FILE, "utf8"))
      : {
          apiKey: process.env.FIREBASE_WEB_API_KEY,
          projectId: process.env.FIREBASE_WEB_PROJECT_ID,
          authDomain: process.env.FIREBASE_WEB_AUTH_DOMAIN,
          appId: process.env.FIREBASE_WEB_APP_ID,
        };
    identityConfigured =
      typeof projectId === "string" &&
      /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId) &&
      web.projectId === projectId &&
      web.authDomain === `${projectId}.firebaseapp.com` &&
      typeof web.apiKey === "string" &&
      Boolean(web.apiKey.trim()) &&
      typeof web.appId === "string" &&
      Boolean(web.appId.trim()) &&
      process.env.FIREBASE_AUTH_EMULATOR_HOST === undefined;
  } catch {}
}
check("Managed identity configuration", identityConfigured);
const objectDir = process.env.PRIVATE_OBJECT_DIR ?? "";
check(
  "Private object storage namespace",
  /^\/[a-z0-9][a-z0-9._-]*\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/.test(
    objectDir,
  ) && !objectDir.split("/").some((part) => part === "." || part === ".."),
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
  "FIREBASE_GOOGLE_ENABLED",
  "FIREBASE_GITHUB_ENABLED",
  "FIREBASE_TOTP_ENABLED",
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
    const schema = await inspectProductSchema(client);
    check("Required product schema", schema.requiredProductSchema);
    check("Required product indexes", schema.requiredIndexes);
    check("Required product constraints", schema.requiredConstraints);
    check("Tracked migration history", await inspectMigrationHistory(client));
    check(
      "Required community role grants",
      schema.requiredProductSchema && (await inspectCommunityGrants(client)),
    );
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
for (const name of [
  "Required product schema",
  "Required product indexes",
  "Required product constraints",
  "Tracked migration history",
  "Required community role grants",
]) {
  if (!results.some((result) => result.check === name)) check(name, false);
}
console.log(
  JSON.stringify(
    {
      results,
      note: "Read-only configuration, schema coverage, exact migration ledger and role-grant checks only. Firebase ADC/token verification, provider delivery/MFA, proxy trust, complete schema/type diff, private object storage, durable Git storage, backup restore and browser acceptance still require staging verification. Schema-only publication needs a separately reviewed migration-history and system-data plan; this command never repairs them.",
    },
    null,
    2,
  ),
);
process.exitCode = results.every((r) => r.ok) ? 0 : 1;
