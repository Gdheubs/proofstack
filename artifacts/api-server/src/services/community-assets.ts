import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import {
  ObjectStorageService,
  ObjectNotFoundError,
} from "../lib/objectStorage";
import { ApiError } from "../lib/errors";
import {
  type CommunityDb,
  missing,
  denied,
  projectReadWhere,
} from "./community-policy";
import type { CommunityAction } from "./community-input";
import { transaction, type AuthSession } from "./auth-sessions";
import { z } from "zod";
export const storage = new ObjectStorageService();
const uploadSchema = z
  .object({
    name: z.string().trim().min(1).max(150),
    size: z.number().int().min(1).max(8388608),
    contentType: z.enum(["image/png", "image/jpeg", "image/webp"]),
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
  const uploadUrl = await storage.getObjectEntityUploadURL();
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
    const objectPath = storage.normalizeObjectEntityPath(uploadUrl);
    const r = await db.query(
      "INSERT INTO community_assets(user_id,object_path,content_type,size) VALUES($1,$2,$3,$4) RETURNING id",
      [uid, objectPath, p.data.contentType, p.data.size],
    );
    return {
      id: r.rows[0].id as string,
      uploadUrl,
      assetPath: `/api/community/assets/${r.rows[0].id}`,
    };
  });
}
export async function assertOwnedAssets(
  db: CommunityDb,
  uid: string,
  paths: string[],
  existing: string[] = [],
) {
  for (const path of paths) {
    if (!path || existing.includes(path)) continue;
    const id = path.split("/").at(-1);
    const r = await db.query(
      "SELECT 1 FROM community_assets WHERE id=$1 AND user_id=$2 AND status='ready' FOR SHARE",
      [id, uid],
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
    try {
      const file = await storage.getObjectEntityFile(row.object_path);
      await file.delete({ ignoreNotFound: true });
    } catch (error) {
      // An abandoned upload may never have reached storage. Still release its quota.
      if (!(error instanceof ObjectNotFoundError)) throw error;
    }
    await db.query("DELETE FROM community_assets WHERE id=$1", [row.id]);
    return { message: "Unused image deleted" };
  }
  if (row.status === "ready")
    return { message: "Image upload already completed", id: row.id as string };
  if (Date.now() - new Date(row.created_at).getTime() > 3600000)
    throw new ApiError(409, "UPLOAD_EXPIRED", "Request a new upload");
  const file = await storage.getObjectEntityFile(row.object_path);
  const [metadata] = await file.getMetadata();
  // Pin validation and promotion to one immutable storage generation. The PUT
  // URL remains valid for 15 minutes and must never address a published image.
  if (!metadata.generation)
    throw new ApiError(409, "UPLOAD_CHANGED", "Retry image completion");
  const source = file.bucket.file(file.name, {
    generation: metadata.generation,
  });
  const [signature] = await source.download({ start: 0, end: 15 });
  if (
    Number(metadata.size) > 8388608 ||
    Number(metadata.size) !== row.size ||
    metadata.contentType !== row.content_type ||
    !imageSignature(signature, row.content_type)
  )
    throw new ApiError(
      400,
      "INVALID_IMAGE",
      "Uploaded image content does not match its declared type or size",
    );
  const objectId = randomUUID();
  const finalPath = `/objects/ready/${objectId}`;
  const finalFile = file.bucket.file(
    `${file.name.slice(0, file.name.lastIndexOf("/uploads/"))}/ready/${objectId}`,
  );
  await source.copy(finalFile, { preconditionOpts: { ifGenerationMatch: 0 } });
  await storage.trySetObjectEntityAclPolicy(finalPath, {
    owner: s.user.id,
    visibility: "private",
  });
  await db.query(
    "UPDATE community_assets SET status='ready',object_path=$2 WHERE id=$1",
    [row.id, finalPath],
  );
  return { message: "Image upload completed", id: row.id as string };
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
      `SELECT 1 FROM community_projects p LEFT JOIN community_organization_profiles op ON op.organization_id=p.organization_id
   WHERE ${projectReadWhere()} AND p.screenshots @> $2::jsonb LIMIT 1`,
      [uid, JSON.stringify([path])],
    );
    if (!allowed.rows[0]) throw missing();
  }
  return {
    row,
    isPublic,
    file: await storage.getObjectEntityFile(row.object_path),
  };
}
