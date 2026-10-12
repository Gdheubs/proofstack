import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  statement_timeout: 30_000,
  lock_timeout: 5_000,
  idle_in_transaction_session_timeout: 120_000,
  query_timeout: 35_000,
  // Leave TLS settings to DATABASE_URL / node-postgres; never disable verification.
});
// node-postgres emits errors for idle clients; do not let a transient socket
// failure crash the process or print a connection string.
pool.on("error", () => {
  console.error("Database idle connection failed");
});
export const db = drizzle(pool, { schema });

export * from "./schema";
