import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const migrationsFolder = new URL("../../../lib/db/drizzle/", import.meta.url);

/** Read repository metadata only; this never applies DDL or system-data writes. */
export async function expectedProductSchema() {
  const journal = JSON.parse(
    await readFile(new URL("meta/_journal.json", migrationsFolder), "utf8"),
  );
  const latest = journal.entries.at(-1);
  if (!latest) throw new Error("Migration inventory is missing");
  const snapshot = JSON.parse(
    await readFile(
      new URL(
        `meta/${String(latest.idx).padStart(4, "0")}_snapshot.json`,
        migrationsFolder,
      ),
      "utf8",
    ),
  );
  const tables = Object.values(snapshot.tables);
  const migrations = await Promise.all(
    journal.entries.map(async (entry) => ({
      timestamp: String(entry.when),
      hash: createHash("sha256")
        .update(
          await readFile(new URL(`${entry.tag}.sql`, migrationsFolder), "utf8"),
        )
        .digest("hex"),
    })),
  );
  return { tables, migrations };
}

/** Structural coverage is not a substitute for a schema diff, TLS/grants or restore tests. */
export async function inspectProductSchema(client, schema = "public") {
  const expected = await expectedProductSchema();
  const tableNames = expected.tables.map((table) => table.name);
  const columns = expected.tables.flatMap((table) =>
    Object.values(table.columns).map((column) => [table.name, column.name]),
  );
  const found = await client.query(
    "SELECT table_name,column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=ANY($2::text[])",
    [schema, tableNames],
  );
  const present = new Set(
    found.rows.map((row) => `${row.table_name}.${row.column_name}`),
  );
  const requiredProductSchema = columns.every(([table, column]) =>
    present.has(`${table}.${column}`),
  );
  const indexes = expected.tables.flatMap((table) =>
    Object.values(table.indexes).map((index) => index.name),
  );
  const foundIndexes = await client.query(
    "SELECT indexname FROM pg_indexes WHERE schemaname=$1 AND indexname=ANY($2::text[])",
    [schema, indexes],
  );
  const indexNames = new Set(foundIndexes.rows.map((row) => row.indexname));
  const requiredIndexes = indexes.every((name) => indexNames.has(name));
  // PostgreSQL truncates these generated ASCII identifiers to NAMEDATALEN-1.
  const constraints = expected.tables.flatMap((table) =>
    [
      "foreignKeys",
      "compositePrimaryKeys",
      "uniqueConstraints",
      "checkConstraints",
    ].flatMap((kind) =>
      Object.values(table[kind] ?? {}).map((constraint) => [
        table.name,
        constraint.name.slice(0, 63),
      ]),
    ),
  );
  const foundConstraints = await client.query(
    "SELECT t.relname AS table_name,c.conname FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname=$1 AND t.relname=ANY($2::text[])",
    [schema, tableNames],
  );
  const constraintNames = new Set(
    foundConstraints.rows.map((row) => `${row.table_name}.${row.conname}`),
  );
  const requiredConstraints = constraints.every(([table, name]) =>
    constraintNames.has(`${table}.${name}`),
  );
  return {
    requiredProductSchema,
    requiredIndexes,
    requiredConstraints,
    expectedTableCount: tableNames.length,
  };
}

export async function inspectMigrationHistory(client) {
  const { migrations } = await expectedProductSchema();
  // Test existence without causing an aborted read-only transaction on schema-only deployments.
  const exists = await client.query(
    "SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS present",
  );
  if (!exists.rows[0]?.present) return false;
  const found = await client.query(
    "SELECT hash,created_at::text AS timestamp FROM drizzle.__drizzle_migrations ORDER BY created_at",
  );
  return (
    found.rows.length === migrations.length &&
    migrations.every(
      (migration, index) =>
        migration.hash === found.rows[index].hash &&
        migration.timestamp === found.rows[index].timestamp,
    )
  );
}

export async function inspectCommunityGrants(client) {
  const found = await client.query(
    "SELECT r.key AS role,p.key AS permission FROM role_permissions rp JOIN roles r ON r.id=rp.role_id JOIN permissions p ON p.id=rp.permission_id WHERE p.key=ANY($1::text[])",
    [
      [
        "community.organization.read",
        "community.organization.manage",
        "community.organization.members",
      ],
    ],
  );
  const actual = new Set(
    found.rows.map((row) => `${row.role}:${row.permission}`),
  );
  const expected = [
    "organization_owner:community.organization.read",
    "organization_admin:community.organization.read",
    "organization_member:community.organization.read",
    "organization_owner:community.organization.manage",
    "organization_admin:community.organization.manage",
    "organization_owner:community.organization.members",
  ];
  return (
    actual.size === expected.length &&
    expected.every((grant) => actual.has(grant))
  );
}
