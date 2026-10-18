import { fileURLToPath } from "node:url";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

if (process.env.NODE_ENV === "production") {
  throw new Error(
    "migrate:dev is disabled in production. Apply production migrations through the reviewed release process.",
  );
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must point to a disposable development database.");
}

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 2,
  idleTimeoutMillis: 5_000,
  connectionTimeoutMillis: 5_000,
  statement_timeout: 30_000,
  query_timeout: 35_000,
});

try {
  await migrate(drizzle(pool), {
    migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
  });
  console.info("Development database migrations applied.");
} finally {
  await pool.end();
}
