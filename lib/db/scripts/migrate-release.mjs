import { fileURLToPath } from "node:url";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

// Release-time migration of a deployed database (staging or production).
// Requires the operator to name the target host so a copied connection string
// cannot migrate the wrong database, and refuses connection-pooler endpoints:
// migrations need one direct session. Never prints the connection string.
export function releaseTarget(env) {
  let url;
  try {
    url = new URL(env.DATABASE_URL ?? "");
  } catch {
    throw new Error("DATABASE_URL must be a PostgreSQL URL");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol))
    throw new Error("DATABASE_URL must be a PostgreSQL URL");
  if (!env.MIGRATION_TARGET_HOST || env.MIGRATION_TARGET_HOST !== url.hostname)
    throw new Error(
      "Set MIGRATION_TARGET_HOST to the exact database host to confirm the target",
    );
  if (url.hostname.includes("-pooler") || url.port === "6543")
    throw new Error(
      "Use the direct (non-pooled) database endpoint for migrations",
    );
  return url.hostname;
}

async function main() {
  const host = releaseTarget(process.env);
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 15_000,
    // Fail fast instead of queueing behind live traffic, but allow long DDL.
    lock_timeout: 10_000,
    statement_timeout: 300_000,
    enableChannelBinding:
      new URL(process.env.DATABASE_URL).searchParams.get("channel_binding") ===
      "require",
  });
  const applied = async () => {
    const present = await pool.query(
      "SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS present",
    );
    if (!present.rows[0].present) return 0;
    return Number(
      (
        await pool.query(
          "SELECT count(*) AS n FROM drizzle.__drizzle_migrations",
        )
      ).rows[0].n,
    );
  };
  try {
    const before = await applied();
    await migrate(drizzle(pool), {
      migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
    });
    const after = await applied();
    console.info(
      `Migrations on ${host}: ${before} previously applied, ${after - before} applied now, ${after} total.`,
    );
  } finally {
    await pool.end();
  }
}

if (
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())
) {
  main().catch((error) => {
    console.error(`Release migration failed: ${error.message}`);
    process.exitCode = 1;
  });
}
