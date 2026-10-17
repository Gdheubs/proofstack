import { databaseQuery, type QueryExecutor } from "./database-query";
import { getTableColumns, getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import * as schema from "@workspace/db/schema";

const expectedColumns = Object.values(schema)
  .filter((value) => is(value, PgTable))
  .flatMap((table) =>
    Object.values(getTableColumns(table)).map((column) => [
      getTableName(table),
      column.name,
    ]),
  );

export async function checkReadiness(query: QueryExecutor = databaseQuery) {
  try {
    const result = await query(
      `SELECT NOT EXISTS (
        SELECT 1 FROM unnest($1::text[],$2::text[]) AS expected(table_name,column_name)
        LEFT JOIN information_schema.columns actual ON actual.table_schema='public'
          AND actual.table_name=expected.table_name AND actual.column_name=expected.column_name
        WHERE actual.column_name IS NULL
      ) AS healthy`,
      [
        expectedColumns.map(([table]) => table),
        expectedColumns.map(([, column]) => column),
      ],
    );
    if (!expectedColumns.length || result.rows[0]?.healthy !== true)
      throw new Error("Product schema is unavailable");
    return { status: "ready" as const, checks: { database: "ready" as const } };
  } catch {
    return {
      status: "not_ready" as const,
      checks: { database: "unavailable" as const },
    };
  }
}
