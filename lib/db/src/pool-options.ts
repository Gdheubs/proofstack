import type { PoolConfig } from "pg";

// Connection settings shared by the API and workers. Kept free of side effects
// so they can be validated without opening a connection.
export function databasePoolOptions(
  env: Record<string, string | undefined> = process.env,
): PoolConfig {
  const connectionString = env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL must be set. Did you forget to provision a database?",
    );
  }
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    // Never echo the value: it contains credentials.
    throw new Error("DATABASE_URL is not a valid PostgreSQL URL");
  }
  const max = Number(env.DATABASE_POOL_MAX ?? 10);
  if (!Number.isInteger(max) || max < 1 || max > 50) {
    throw new Error("DATABASE_POOL_MAX must be an integer from 1 to 50");
  }
  return {
    connectionString,
    max,
    idleTimeoutMillis: 30_000,
    // Serverless PostgreSQL (Neon) resumes a scaled-to-zero compute on connect.
    connectionTimeoutMillis: 10_000,
    statement_timeout: 30_000,
    lock_timeout: 5_000,
    idle_in_transaction_session_timeout: 120_000,
    query_timeout: 35_000,
    // node-postgres parses but does not act on `channel_binding`; honour it.
    enableChannelBinding: url.searchParams.get("channel_binding") === "require",
    // Leave TLS settings to DATABASE_URL / node-postgres; never disable verification.
  };
}
