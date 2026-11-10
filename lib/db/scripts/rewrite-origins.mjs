import { fileURLToPath } from "node:url";
import pg from "pg";
import { releaseTarget } from "./migrate-release.mjs";

// After the site or the demo site moves to a new address (a custom domain),
// saved links that start with the old origin are rewritten to the new one:
// project Repository and Demo URLs. Only the origin prefix changes; paths are
// kept. Run as: ORIGIN_FROM=https://old ORIGIN_TO=https://new
// MIGRATION_TARGET_HOST=<db host> pnpm --filter @workspace/db run rewrite:origins

function origin(value, name) {
  let url;
  try {
    url = new URL(value ?? "");
  } catch {
    throw new Error(`${name} must be an https origin`);
  }
  if (url.protocol !== "https:" || url.origin !== value)
    throw new Error(`${name} must be an https origin without a path`);
  return url.origin;
}

// Rewrites with any query function (pool, client or transaction). Returns the
// number of changed rows per column.
export async function rewriteOrigins(query, from, to) {
  const a = origin(from, "ORIGIN_FROM");
  const b = origin(to, "ORIGIN_TO");
  if (a === b) return { repository_url: 0, demo_url: 0 };
  const counts = {};
  for (const column of ["repository_url", "demo_url"]) {
    const result = await query(
      `UPDATE community_projects SET ${column}=$2||substr(${column},length($1)+1),updated_at=now()
       WHERE lower(${column}) LIKE lower($1)||'/%' OR lower(${column})=lower($1)`,
      [a, b],
    );
    counts[column] = result.rowCount ?? 0;
  }
  return counts;
}

async function main() {
  const host = releaseTarget(process.env);
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 15_000,
    statement_timeout: 60_000,
    enableChannelBinding:
      new URL(process.env.DATABASE_URL).searchParams.get("channel_binding") ===
      "require",
  });
  try {
    const counts = await rewriteOrigins(
      (text, values) => pool.query(text, values),
      process.env.ORIGIN_FROM,
      process.env.ORIGIN_TO,
    );
    console.log(
      `Origins rewritten on ${host}: ${counts.repository_url} repository links, ${counts.demo_url} demo links.`,
    );
  } finally {
    await pool.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
