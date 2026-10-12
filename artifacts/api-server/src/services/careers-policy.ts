import { pool } from "@workspace/db";
import { z } from "zod";
import { ApiError } from "../lib/errors";
import { memberAccessWhere, type CommunityDb } from "./community-policy";
export const id = z.string().uuid();
export const short = (n: number) => z.string().trim().max(n);
export const tags = z.array(short(60).min(1)).max(12);
export const proofIds = z
  .array(id)
  .max(3)
  .refine((v) => new Set(v).size === v.length);
export const fail = (message: string) =>
  new ApiError(400, "CAREER_INPUT_INVALID", message);
export const managerWhere = (org: string, uid: string) =>
  `(${memberAccessWhere(org, uid)} AND EXISTS(SELECT 1 FROM organization_members hm JOIN roles hr ON hr.id=hm.role_id JOIN role_permissions hp ON hp.role_id=hr.id JOIN permissions hperm ON hperm.id=hp.permission_id WHERE hm.organization_id=${org} AND hm.user_id=${uid}::uuid AND hm.status='active' AND hr.key IN ('organization_owner','organization_admin') AND hperm.key='community.organization.manage'))`;
export async function proofs(
  uid: string,
  ids?: string[],
  db: CommunityDb = pool,
) {
  const r = await db.query(
    `SELECT p.id,p.slug,p.title,p.description,p.repository_url AS "repositoryUrl",p.demo_url AS "demoUrl",CASE WHEN p.owner_id=$1 THEN 'owner' ELSE 'contributor' END AS relationship FROM community_projects p JOIN users u ON u.id=p.owner_id AND u.status='active' LEFT JOIN community_organization_profiles op ON op.organization_id=p.organization_id WHERE p.visibility='public' AND coalesce(op.visibility,'public')='public' AND (p.owner_id=$1 OR EXISTS(SELECT 1 FROM community_contributors c WHERE c.project_id=p.id AND c.user_id=$1 AND c.status='active')) AND ($2::uuid[] IS NULL OR p.id=ANY($2::uuid[])) ORDER BY p.updated_at DESC LIMIT 50`,
    [uid, ids ?? null],
  );
  return r.rows;
}
export async function validateProofs(
  uid: string,
  ids: string[],
  db: CommunityDb,
) {
  if ((await proofs(uid, ids, db)).length !== ids.length)
    throw fail("Select public projects you own or contribute to.");
}
export const transitions: Record<string, string[]> = {
  submitted: ["reviewing", "shortlisted", "interview", "rejected"],
  reviewing: ["shortlisted", "interview", "rejected"],
  shortlisted: ["interview", "offered", "rejected"],
  interview: ["offered", "rejected"],
  offered: [],
  rejected: [],
  withdrawn: [],
};

/** One evidence query for an entire directory or application page. */
export async function proofBatch(
  items: { key: string; uid: string; ids: string[] }[],
) {
  const result = new Map<string, Awaited<ReturnType<typeof proofs>>>();
  if (!items.length) return result;
  const rows = await pool.query(
    `SELECT wanted.key,p.id,p.slug,p.title,p.description,p.repository_url AS "repositoryUrl",p.demo_url AS "demoUrl",CASE WHEN p.owner_id=wanted.uid THEN 'owner' ELSE 'contributor' END AS relationship FROM jsonb_to_recordset($1::jsonb) AS wanted(key text,uid uuid,ids jsonb) JOIN users candidate ON candidate.id=wanted.uid AND candidate.status='active' JOIN community_projects p ON p.id IN (SELECT value::uuid FROM jsonb_array_elements_text(wanted.ids)) JOIN users owner ON owner.id=p.owner_id AND owner.status='active' LEFT JOIN community_organization_profiles op ON op.organization_id=p.organization_id WHERE p.visibility='public' AND coalesce(op.visibility,'public')='public' AND (p.owner_id=wanted.uid OR EXISTS(SELECT 1 FROM community_contributors c WHERE c.project_id=p.id AND c.user_id=wanted.uid AND c.status='active')) ORDER BY p.updated_at DESC,p.id`,
    [JSON.stringify(items)],
  );
  for (const row of rows.rows) {
    const { key, ...proof } = row;
    const bucket = result.get(key) ?? [];
    bucket.push(proof);
    result.set(key, bucket);
  }
  return result;
}
