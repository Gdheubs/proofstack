import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import { databasePoolOptions } from "./pool-options";

const { Pool } = pg;

export const pool = new Pool(databasePoolOptions());
// node-postgres emits errors for idle clients; do not let a transient socket
// failure crash the process or print a connection string.
pool.on("error", () => {
  console.error("Database idle connection failed");
});
export const db = drizzle(pool, { schema });

export * from "./schema";
export { databasePoolOptions } from "./pool-options";
