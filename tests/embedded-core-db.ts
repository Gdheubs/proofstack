// Test-only transport adapter, like embedded-db.ts, but for a database that
// is behind the code: it replays the core migrations 0000 to 0021 only, so no
// table of the modules barrel (0022 onwards) exists. Core-only tests prove
// that existing code keeps working while a module migration is pending.
// Does not validate native wire-protocol behavior, concurrent transactions or TLS.
import { afterAll, vi } from "vitest";
const state = vi.hoisted(() => ({ close: async () => {} }));

vi.mock("pg", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { readFile } = await import("node:fs/promises");
  // The last migration of the core schema and the number of tables it leaves.
  const LAST_CORE_INDEX = 21;
  const LAST_CORE_TAG = "0021_retired_handles";
  const CORE_TABLES = 54;
  const db = await PGlite.create();
  state.close = () => db.close();
  const folder = new URL("../lib/db/drizzle/", import.meta.url);
  const journal = JSON.parse(
    await readFile(new URL("meta/_journal.json", folder), "utf8"),
  ) as { entries: Array<{ idx: number; tag: string }> };
  const core = journal.entries.filter((entry) => entry.idx <= LAST_CORE_INDEX);
  // Run the exact tracked SQL in journal order inside a single disposable engine.
  for (const entry of core) {
    await db.exec(await readFile(new URL(`${entry.tag}.sql`, folder), "utf8"));
  }
  // Refuse to run on anything but the core schema: a test that passes here
  // because a module table happened to exist would prove nothing.
  const tables = await db.query<{ count: number }>(
    "SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'",
  );
  if (
    core.length !== LAST_CORE_INDEX + 1 ||
    core.at(-1)?.tag !== LAST_CORE_TAG ||
    tables.rows[0]?.count !== CORE_TABLES
  )
    throw new Error(
      `The core-only database must hold migrations 0000 to ${LAST_CORE_TAG} and ${CORE_TABLES} tables`,
    );
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
