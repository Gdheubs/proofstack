import { describe, expect, it, vi } from "vitest";
import { pool } from "@workspace/db";
import { exportAccount } from "../artifacts/api-server/src/services/account-data";
import {
  EXPORT_BASELINE,
  EXPORT_POLICY,
  exportRule,
} from "../artifacts/api-server/src/services/export-policy";

describe("account export policy catalog", () => {
  it("classifies every users foreign key in the migrated schema", async () => {
    const refs = await pool.query<{ table: string; column: string }>(
      `SELECT c.conrelid::regclass::text AS table, a.attname AS column
       FROM pg_constraint c
       JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey)
       WHERE c.contype='f' AND c.confrelid='public.users'::regclass
       ORDER BY 1,2`,
    );
    expect(refs.rows.length).toBeGreaterThanOrEqual(EXPORT_BASELINE.length);
    const unknown = refs.rows.filter(({ table, column }) => {
      const normalized = table.replace(/^public\./, "");
      return exportRule(normalized, column) === undefined;
    });
    expect(unknown).toEqual([]);

    const actorColumns = refs.rows.filter(({ column }) =>
      /(^|_)(actor|grader|reviewer|moderator|created_by|granted_by|handled_by|lifted_by|revoked_by)$/.test(
        column,
      ),
    );
    for (const { table, column } of actorColumns)
      expect(exportRule(table.replace(/^public\./, ""), column)).toBe("none");
  });

  it("freezes the legacy baseline and never adds actor rules to that baseline", () => {
    expect(Object.isFrozen(EXPORT_BASELINE)).toBe(true);
    expect(Object.isFrozen(EXPORT_POLICY)).toBe(true);
    for (const key of EXPORT_BASELINE)
      expect(exportRule(...(key.split(".") as [string, string]))).toBe("full");
  });

  it("fails explicitly instead of silently truncating an oversized export", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FROM pg_constraint"))
        return { rows: [{ table: "assessment_attempts", column: "user_id" }] };
      if (sql.includes("SELECT id,email,phone")) return { rows: [] };
      expect(sql).toContain("LIMIT 5001");
      return { rows: Array.from({ length: 5001 }, (_, id) => ({ id })) };
    });
    await expect(
      exportAccount({ query } as never, "00000000-0000-4000-8000-000000000001"),
    ).rejects.toMatchObject({ status: 413, code: "EXPORT_TOO_LARGE" });
  });
});
