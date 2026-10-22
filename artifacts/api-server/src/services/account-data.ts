import type { PoolClient } from "pg";
import { ApiError } from "../lib/errors";
import { privateAssetDirectory } from "./community-assets";
import { DELETED_ACCOUNT_RETENTION_DAYS, TERMS_VERSION } from "./legal";

// Erases an account inside the caller's transaction. Uploaded images are
// queued for removal from object storage first; everything that references
// the user then cascades. Registration details move to deleted_accounts.
export async function eraseAccount(db: PoolClient, userId: string) {
  const owned = (
    await db.query(
      `SELECT o.name FROM organizations o JOIN organization_members m ON m.organization_id=o.id
      JOIN roles r ON r.id=m.role_id AND r.key='organization_owner'
      WHERE m.user_id=$1 AND m.status='active' AND NOT EXISTS(
        SELECT 1 FROM organization_members other JOIN roles orl ON orl.id=other.role_id AND orl.key='organization_owner'
        JOIN users ou ON ou.id=other.user_id AND ou.status='active'
        WHERE other.organization_id=o.id AND other.user_id<>$1 AND other.status='active')`,
      [userId],
    )
  ).rows;
  if (owned.length)
    throw new ApiError(
      409,
      "LAST_OWNER_DELETION",
      `Transfer or delete these organizations first: ${owned.map((o) => o.name).join(", ")}`,
    );
  const user = (
    await db.query(
      "SELECT auth_subject,email,phone,created_at FROM users WHERE id=$1 FOR UPDATE",
      [userId],
    )
  ).rows[0];
  if (!user) throw new ApiError(404, "USER_NOT_FOUND", "Account not found");
  // Only accounts with uploads need storage configured to be deleted.
  const assets = (
    await db.query("SELECT 1 FROM community_assets WHERE user_id=$1 LIMIT 1", [
      userId,
    ])
  ).rows.length;
  if (assets) {
    const directory = privateAssetDirectory();
    const [, bucket, ...prefix] = directory.split("/");
    const namespace = prefix.join("/");
    await db.query(
      `INSERT INTO asset_cleanup_jobs(asset_id,object_path,bucket,namespace,object_name)
     SELECT id,object_path,$2,$3,$3||'/'||substr(object_path,10) FROM community_assets
     WHERE user_id=$1 AND object_path ~ '^/objects/(ready|uploads)/[0-9a-f-]{36}$'
     ON CONFLICT(asset_id) DO NOTHING`,
      [userId, bucket, namespace],
    );
  }
  await db.query(
    `INSERT INTO deleted_accounts(auth_subject,email,phone,registered_at,purge_after)
     VALUES($1,$2,$3,$4,now()+make_interval(days=>$5::int))`,
    [
      user.auth_subject,
      user.email,
      user.phone,
      user.created_at,
      DELETED_ACCOUNT_RETENTION_DAYS,
    ],
  );
  await db.query("DELETE FROM users WHERE id=$1", [userId]);
  return user.auth_subject as string;
}

// Columns that are secrets or internal digests, never part of an export.
const NOT_EXPORTED = new Set([
  "encrypted_credentials",
  "encrypted_payload",
  "handle_hash",
  "token_hash",
  "code_hash",
  "device_hash",
  "identifier_hash",
  "lease_token",
]);

// A copy of the personal data held for one account (DPDP Act s.11). Every
// table with a foreign key to users is found from the catalog, so new tables
// are included automatically.
export async function exportAccount(db: PoolClient, userId: string) {
  const refs = (
    await db.query<{ table: string; column: string }>(
      `SELECT c.conrelid::regclass::text AS table, a.attname AS column
       FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey)
       WHERE c.contype='f' AND c.confrelid='public.users'::regclass ORDER BY 1,2`,
    )
  ).rows;
  const clean = (rows: Record<string, unknown>[]) =>
    rows.map((row) =>
      Object.fromEntries(
        Object.entries(row).filter(([key]) => !NOT_EXPORTED.has(key)),
      ),
    );
  const account = (
    await db.query(
      `SELECT id,email,phone,to_char(birth_date,'YYYY-MM-DD') AS birth_date,platform_role,status,
       email_verified_at,phone_verified_at,created_at,updated_at FROM users WHERE id=$1`,
      [userId],
    )
  ).rows[0];
  const tables: Record<string, Record<string, unknown>[]> = {};
  for (const { table, column } of refs) {
    const { rows } = await db.query(
      `SELECT * FROM ${quote(table)} WHERE ${quote(column)}=$1 LIMIT 5000`,
      [userId],
    );
    if (rows.length)
      tables[`${table}.${column}`] = clean(rows as Record<string, unknown>[]);
  }
  return {
    exportedAt: new Date().toISOString(),
    termsVersion: TERMS_VERSION,
    account,
    data: tables,
  };
}
// Catalog names are trusted, but quote them as identifiers regardless.
const quote = (name: string) =>
  name
    .split(".")
    .map((part) => `"${part.replaceAll('"', '""')}"`)
    .join(".");
