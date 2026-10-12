// Test-only transport adapter. Executes real PostgreSQL SQL in WASM, not a SQL mock.
// Does not validate native wire-protocol behavior, concurrent transactions or TLS.
import { afterAll, vi } from "vitest";
const state = vi.hoisted(() => ({ close: async () => {} }));

vi.mock("pg", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { readFile } = await import("node:fs/promises");
  const db = await PGlite.create();
  state.close = () => db.close();
  const folder = new URL("../lib/db/drizzle/", import.meta.url);
  const journal = JSON.parse(
    await readFile(new URL("meta/_journal.json", folder), "utf8"),
  );
  // Run the exact tracked SQL in journal order inside a single disposable engine.
  for (const entry of journal.entries) {
    await db.exec(await readFile(new URL(`${entry.tag}.sql`, folder), "utf8"));
  }
  async function query(
    text: string | { text: string; values?: unknown[] },
    values?: unknown[],
  ) {
    const sql = typeof text === "string" ? text : text.text;
    const result = await db.query(
      sql,
      values ?? (typeof text === "string" ? [] : text.values),
    );
    return {
      rows: result.rows,
      rowCount: result.rows.length || result.affectedRows || 0,
      fields: result.fields,
    };
  }
  class Pool {
    query = query;
    async connect() {
      return { query, release() {} };
    }
    async end() {}
    on() {
      return this;
    }
  }
  return { default: { Pool }, Pool };
});
afterAll(async () => {
  await state.close();
});
