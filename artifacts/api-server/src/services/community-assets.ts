import { randomUUID } from "node:crypto";
import type { Request } from "express";
import { pool } from "@workspace/db";
import {
  ObjectStorageService,
  StorageConfigurationError,
} from "../lib/objectStorage";
import { ApiError } from "../lib/errors";
import {
  type CommunityDb,
  missing,
  denied,
  projectReadWhere,
} from "./community-policy";
import type { CommunityAction } from "./community-input";
import { transaction, audit, type AuthSession } from "./auth-sessions";
import { images } from "./image-canonical";
import { z } from "zod/v3";
export const storage = new ObjectStorageService();
export const MAX_IMAGE_BYTES = 8388608;
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export function privateAssetDirectory() {
  try {
    storage.assertConfigured();
    return storage.getPrivateObjectDir();
  } catch (error) {
    if (error instanceof StorageConfigurationError)
      throw new ApiError(
        503,
        "STORAGE_CONFIGURATION_REQUIRED",
        "Image storage is not configured",
      );
    throw error;
  }
}
const uploadSchema = z
  .object({
    name: z.string().trim().min(1).max(150),
    size: z.number().int().min(1).max(MAX_IMAGE_BYTES),
    contentType: z.enum(IMAGE_TYPES),
  })
  .strict();
export function imageSignature(bytes: Buffer, type: string) {
  return type === "image/png"
    ? bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : type === "image/jpeg"
      ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      : type === "image/webp"
        ? bytes.subarray(0, 4).toString() === "RIFF" &&
          bytes.subarray(8, 12).toString() === "WEBP"
        : false;
}
export async function requestUpload(body: unknown, uid: string) {
  const p = uploadSchema.safeParse(body);
  if (!p.success)
    throw new ApiError(
      400,
      "INVALID_UPLOAD",
      "Use a PNG, JPEG or WebP image up to 8 MiB",
    );
  privateAssetDirectory();
  return transaction(async (db) => {
    // Serialize quota reservations per account, including concurrent uploads.
    await db.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [uid]);
    const count = (
      await db.query(
        "SELECT count(*)::int AS n FROM community_assets WHERE user_id=$1",
        [uid],
      )
    ).rows[0].n;
    if (count >= 100)
      throw new ApiError(
        409,
        "UPLOAD_LIMIT",
        "Remove unused images before uploading more",
      );
    // Reserve the final immutable key before any byte is written, so cleanup
    // always targets the exact object this asset may own.
    const r = await db.query(
      "INSERT INTO community_assets(user_id,object_path,content_type,size) VALUES($1,$2,$3,$4) RETURNING id",
      [uid, `/objects/ready/${randomUUID()}`, p.data.contentType, p.data.size],
    );
    const id = r.rows[0].id as string;
    return {
      id,
      uploadUrl: `/api/community/assets/${id}/content`,
      assetPath: `/api/community/assets/${id}`,
    };
  });
}
type AssetRow = {
  id: string;
  user_id: string;
  status: string;
  created_at: string | Date;
  size: number;
  content_type: (typeof IMAGE_TYPES)[number];
  object_path: string;
};
function assertUploadable(row: AssetRow | undefined, uid: string) {
  if (!row) throw missing();
  if (row.user_id !== uid) throw denied();
  if (row.status === "ready")
    throw new ApiError(
      409,
      "UPLOAD_COMPLETE",
      "This image upload is already complete",
    );
  if (row.status !== "pending")
    throw new ApiError(
      409,
      "ASSET_DELETING",
      "Image deletion is pending; request a new upload",
    );
  if (Date.now() - new Date(row.created_at).getTime() > 3600000)
    throw new ApiError(409, "UPLOAD_EXPIRED", "Request a new upload");
  return row;
}
// Bytes pass through the API rather than a presigned URL: size, type and
// signature are enforced, then the image is fully decoded and re-encoded, so
// only canonical pixels without metadata ever reach storage.
export async function storeAssetContent(
  req: Request,
  uid: string,
  id: string,
  contentType: string | undefined,
  body: Buffer,
) {
  privateAssetDirectory();
  const row = assertUploadable(
    (await pool.query("SELECT * FROM community_assets WHERE id=$1", [id]))
      .rows[0],
    uid,
  );
  const type = contentType?.split(";")[0].trim().toLowerCase();
  if (
    body.length > MAX_IMAGE_BYTES ||
    body.length !== row.size ||
    type !== row.content_type ||
    !imageSignature(body, row.content_type)
  )
    throw new ApiError(
      400,
      "INVALID_IMAGE",
      "Uploaded image content does not match its declared type or size",
    );
  // Decode without holding a row lock; the state is rechecked under it below.
  const canonical = await images.canonical(body, row.content_type);
  if (canonical.length > MAX_IMAGE_BYTES)
    throw new ApiError(
      400,
      "INVALID_IMAGE",
      "The processed image exceeds 8 MiB; upload a smaller image",
    );
  return transaction(async (db) => {
    const locked = assertUploadable(
      (
        await db.query(
          "SELECT * FROM community_assets WHERE id=$1 FOR UPDATE",
          [id],
        )
      ).rows[0],
      uid,
    );
    // The row lock is held across this single write: a concurrent delete or
    // second upload waits and then sees the final status.
    await storage.put(
      storage.locate(locked.object_path),
      canonical,
      locked.content_type,
    );
    await db.query(
      "UPDATE community_assets SET status='ready',size=$2 WHERE id=$1",
      [locked.id, canonical.length],
    );
    await audit(req, "community.asset-upload", uid, id, {}, db);
    return { message: "Image upload completed", id };
  });
}
export async function assertOwnedAssets(
  db: CommunityDb,
  uid: string,
  paths: string[],
  existing: string[] = [],
) {
  for (const path of paths) {
    if (!path) continue;
    const id = path.split("/").at(-1);
    const r = await db.query(
      "SELECT 1 FROM community_assets WHERE id=$1 AND (user_id=$2 OR $3::boolean) AND status='ready' FOR SHARE",
      [id, uid, existing.includes(path)],
    );
    if (!r.rows[0])
      throw new ApiError(
        400,
        "OWNED_IMAGE_REQUIRED",
        "Use an image you uploaded and completed",
      );
  }
}
export async function assetAction(
  db: CommunityDb,
  s: AuthSession,
  input: CommunityAction,
) {
  if (input.action !== "asset-complete" && input.action !== "asset-delete")
    return null;
  const row = (
    await db.query("SELECT * FROM community_assets WHERE id=$1 FOR UPDATE", [
      input.id,
    ])
  ).rows[0];
  if (!row) throw missing();
  if (row.user_id !== s.user.id) throw denied();
  if (input.action === "asset-delete") {
    const path = `/api/community/assets/${row.id}`;
    const refs = await db.query(
      "SELECT 1 FROM profiles WHERE avatar_url=$1 UNION ALL SELECT 1 FROM community_projects WHERE screenshots @> $2::jsonb LIMIT 1",
      [path, JSON.stringify([path])],
    );
    if (refs.rows[0])
      throw new ApiError(
        409,
        "IMAGE_IN_USE",
        "Remove this image from its profile or project before deleting it",
      );
    // Only SQL is allowed here: runCommunityAction still has to append its audit
    // and COMMIT. Keep the reservation until a supervised worker deletes bytes.
    if (row.status === "deleting") {
      const job = (
        await db.query(
          "SELECT state FROM asset_cleanup_jobs WHERE asset_id=$1",
          [row.id],
        )
      ).rows[0];
      return {
        message:
          job?.state === "failed"
            ? "Image cleanup needs operator attention; quota remains reserved"
            : "Image deletion pending; quota remains reserved",
      };
    }
    const directory = privateAssetDirectory();
    if (
      !/^\/objects\/(ready|uploads)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
        row.object_path,
      )
    )
      throw new ApiError(
        409,
        "INVALID_ASSET_LOCATION",
        "Image location requires operator review",
      );
    const [, bucket, ...prefix] = directory.split("/");
    const namespace = prefix.join("/");
    await db.query(
      `INSERT INTO asset_cleanup_jobs(asset_id,object_path,bucket,namespace,object_name,available_at)
       VALUES($1,$2,$3,$4,$5,CASE WHEN $6::text='pending' THEN $7::timestamptz + interval '1 hour' ELSE now() END)`,
      [
        row.id,
        row.object_path,
        bucket,
        namespace,
        `${namespace}/${row.object_path.slice(9)}`,
        row.status,
        row.created_at,
      ],
    );
    await db.query(
      "UPDATE community_assets SET status='deleting' WHERE id=$1",
      [row.id],
    );
    return { message: "Image deletion pending; quota remains reserved" };
  }
  if (row.status === "deleting")
    throw new ApiError(
      409,
      "ASSET_DELETING",
      "Image deletion is pending; request a new upload",
    );
  if (row.status === "ready")
    return { message: "Image upload completed", id: row.id as string };
  // Completion now happens when the API stores validated content.
  throw new ApiError(
    409,
    "UPLOAD_CONTENT_REQUIRED",
    "Upload the image content before completing it",
  );
}
export async function assetAccess(id: string, uid: string | null) {
  const row = (
    await pool.query(
      "SELECT * FROM community_assets WHERE id=$1 AND status='ready'",
      [id],
    )
  ).rows[0];
  if (!row) throw missing();
  const path = `/api/community/assets/${id}`;
  const publicRef = await pool.query(
    `SELECT 1 FROM profiles pr JOIN users u ON u.id=pr.user_id AND u.status='active' WHERE pr.avatar_url=$1 AND pr.handle IS NOT NULL
 UNION ALL SELECT 1 FROM community_projects p JOIN users u ON u.id=p.owner_id AND u.status='active' LEFT JOIN community_organization_profiles op ON op.organization_id=p.organization_id
 WHERE p.screenshots @> $2::jsonb AND p.visibility='public' AND coalesce(op.visibility,'public')='public' LIMIT 1`,
    [path, JSON.stringify([path])],
  );
  const isPublic = !!publicRef.rows[0];
  if (!isPublic && row.user_id !== uid) {
    const allowed = await pool.query(
      `SELECT 1 FROM community_projects p JOIN users owner ON owner.id=p.owner_id AND owner.status='active' LEFT JOIN community_organization_profiles op ON op.organization_id=p.organization_id
   WHERE ${projectReadWhere()} AND p.screenshots @> $2::jsonb LIMIT 1`,
      [uid, JSON.stringify([path])],
    );
    if (!allowed.rows[0]) throw missing();
  }
  return {
    row,
    isPublic,
    object: storage.locate(row.object_path),
  };
}
