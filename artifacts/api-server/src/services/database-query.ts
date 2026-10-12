import { pool } from "@workspace/db";

export type QueryExecutor = (
  text: string,
  values: unknown[],
) => Promise<{ rows: Record<string, unknown>[] }>;

export const databaseQuery: QueryExecutor = (text, values) =>
  pool.query(text, values);
