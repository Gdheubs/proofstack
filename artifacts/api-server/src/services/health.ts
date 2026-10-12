import { databaseQuery, type QueryExecutor } from "./database-query";

export async function checkReadiness(query: QueryExecutor = databaseQuery) {
  try {
    await query("SELECT 1 AS healthy", []);
    return { status: "ready" as const, checks: { database: "ready" as const } };
  } catch {
    return {
      status: "not_ready" as const,
      checks: { database: "unavailable" as const },
    };
  }
}
