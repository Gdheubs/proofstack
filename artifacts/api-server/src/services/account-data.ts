import { randomUUID as cryptoRandomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { ApiError } from "../lib/errors";
import { privateAssetDirectory } from "./community-assets";
import { DELETED_ACCOUNT_RETENTION_DAYS, TERMS_VERSION } from "./legal";
import { forgetAccountRepositories, retireHandle } from "./repository-cleanup";
import { exportRule } from "./export-policy";
import { mediaCleanupSchemaReady } from "./module-ready";

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
  // Probe the live catalog on every erase. A stale absent/expired readiness
  // cache must never let a media owner cascade before its cleanup is queued.
  const mediaSchema = await mediaCleanupSchemaReady((text, values) =>
    db.query(text, values),
  );
  if (mediaSchema === "unavailable")
    throw new ApiError(
      503,
      "MEDIA_CLEANUP_UNAVAILABLE",
      "Account deletion is temporarily unavailable",
    );
  if (mediaSchema === "ready") {
    await queueOwnedMediaCleanup(db, userId);
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
  // Stored code and demos go with the account; its username stays reserved
  // for 90 days so nobody can take over its addresses.
  await forgetAccountRepositories(db, userId);
  const handle = (
    await db.query("SELECT handle FROM profiles WHERE user_id=$1", [userId])
  ).rows[0]?.handle as string | undefined;
  if (handle) await retireHandle(db, null, handle);
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
  "encrypted_token",
]);
// Keys removed wherever they appear inside exported JSON values: answer keys
// and grading material are not the member's personal data, and exporting
// them during an open skill check would hand over the answers.
const NOT_EXPORTED_NESTED = new Set(["correctOptionId"]);
const MAX_EXPORT_ROWS = 5000;
function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object" && !(value instanceof Date))
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !NOT_EXPORTED_NESTED.has(key))
        .map(([key, nested]) => [key, redact(nested)]),
    );
  return value;
}

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
        Object.entries(row)
          .filter(([key]) => !NOT_EXPORTED.has(key))
          .map(([key, value]) => [key, redact(value)]),
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
    const rule = exportRule(table, column);
    // Unknown policy is a programming/schema error. Never widen access to
    // SELECT * by default when a new user foreign key is introduced.
    if (rule === undefined)
      throw new ApiError(
        500,
        "EXPORT_POLICY_MISSING",
        "Account export is temporarily unavailable",
      );
    if (rule === "none") continue;
    const selected = rule === "full" ? "*" : rule.map(quote).join(",");
    const { rows } = await db.query(
      `SELECT ${selected} FROM ${quote(table)} WHERE ${quote(column)}=$1 LIMIT ${MAX_EXPORT_ROWS + 1}`,
      [userId],
    );
    if (rows.length > MAX_EXPORT_ROWS)
      throw new ApiError(
        413,
        "EXPORT_TOO_LARGE",
        "Account export exceeds the supported size",
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

type MediaCleanupTarget = {
  id: string;
  storage: string;
  namespace: string;
  object_path: string | null;
  external_id: string | null;
};

async function queueOwnedMediaCleanup(db: PoolClient, userId: string) {
  const objects = (
    await db.query<MediaCleanupTarget>(
      `SELECT id,storage,namespace,object_path,external_id
       FROM media_objects WHERE owner_id=$1`,
      [userId],
    )
  ).rows;
  const r2Objects = objects.filter((media) => media.object_path);
  const mediaIds = objects.map((media) => media.id);

  for (const media of objects) {
    if (media.storage === "stream" && media.external_id) {
      await db.query(
        `INSERT INTO media_cleanup_jobs(provider,external_id)
         VALUES('stream',$1) ON CONFLICT(provider,external_id) DO NOTHING`,
        [media.external_id],
      );
    }
  }

  const renditions = mediaIds.length
    ? (
        await db.query<{
          media_id: string;
          kind: string;
          namespace: string;
          object_path: string;
          storage: string;
        }>(
          `SELECT r.media_id,r.kind,r.namespace,r.object_path,m.storage
           FROM media_renditions r JOIN media_objects m ON m.id=r.media_id
           WHERE r.media_id=ANY($1::uuid[])`,
          [mediaIds],
        )
      ).rows
    : [];

  for (const media of r2Objects) {
    if (!media.object_path) continue;
    await enqueueMediaObject(
      db,
      media.id,
      media.storage,
      media.namespace,
      media.object_path,
    );
  }
  for (const rendition of renditions) {
    await enqueueMediaObject(
      db,
      randomOutboxId(),
      rendition.storage,
      rendition.namespace,
      rendition.object_path,
    );
  }
}

async function enqueueMediaObject(
  db: PoolClient,
  id: string,
  storage: string,
  namespace: string,
  objectPath: string,
) {
  if (!/^\/objects\/ready\/[0-9a-f-]{36}$/i.test(objectPath))
    throw new ApiError(
      503,
      "MEDIA_CLEANUP_UNAVAILABLE",
      "Account deletion is temporarily unavailable",
    );
  const directory =
    storage === "r2_evidence"
      ? process.env.EVIDENCE_OBJECT_DIR
      : storage === "r2_social"
        ? privateAssetDirectory()
        : undefined;
  if (
    !directory ||
    !/^\/[a-z0-9][a-z0-9._-]*(?:\/[A-Za-z0-9._-]+)*$/.test(directory)
  )
    throw new ApiError(
      503,
      "MEDIA_CLEANUP_UNAVAILABLE",
      "Account deletion is temporarily unavailable",
    );
  const [, bucket] = directory.split("/");
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(bucket) || !namespace)
    throw new ApiError(
      503,
      "MEDIA_CLEANUP_UNAVAILABLE",
      "Account deletion is temporarily unavailable",
    );
  const objectName = `${namespace}/${objectPath.slice(9)}`;
  await db.query(
    `INSERT INTO asset_cleanup_jobs(asset_id,object_path,bucket,namespace,object_name)
     VALUES($1,$2,$3,$4,$5) ON CONFLICT(asset_id) DO NOTHING`,
    [id, objectPath, bucket, namespace, objectName],
  );
}

function randomOutboxId(): string {
  return cryptoRandomUUID();
}
// Catalog names are trusted, but quote them as identifiers regardless.
const quote = (name: string) =>
  name
    .split(".")
    .map((part) => `"${part.replaceAll('"', '""')}"`)
    .join(".");
