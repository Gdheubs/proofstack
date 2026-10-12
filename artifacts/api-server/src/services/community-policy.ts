import { pool } from "@workspace/db";
import type { Pool } from "pg";
import { ApiError } from "../lib/errors";
import { requireFresh, type AuthSession } from "./auth-sessions";
import { hasPermission } from "./authorization";
export type CommunityDb = Pick<Pool, "query">;
export const missing = () =>
  new ApiError(404, "COMMUNITY_NOT_FOUND", "This content is not available");
export const denied = () =>
  new ApiError(
    403,
    "COMMUNITY_PERMISSION_DENIED",
    "You do not have permission to change this content",
  );
export const memberAccessWhere = (
  organization: string,
  viewer = "$1",
) => `EXISTS(SELECT 1 FROM organization_members access_m
 JOIN users access_u ON access_u.id=access_m.user_id AND access_u.status='active'
 JOIN role_permissions access_rp ON access_rp.role_id=access_m.role_id
 JOIN permissions access_perm ON access_perm.id=access_rp.permission_id AND access_perm.key='community.organization.read'
 WHERE access_m.organization_id=${organization} AND access_m.user_id=${viewer}::uuid AND access_m.status='active')`;
export const projectReadWhere = (viewer = "$1") => `(
 (p.visibility='public' AND coalesce(op.visibility,'public')='public')
 OR (p.organization_id IS NULL AND p.owner_id=${viewer}::uuid)
 OR ${memberAccessWhere("p.organization_id", viewer)})`;
// Internal SQL aliases only; never pass request input to these builders.
export const postReadWhere = (alias = "p") => `(
 ${alias}.project_id IS NULL OR EXISTS(
 SELECT 1 FROM community_projects visible_project
 JOIN users visible_owner ON visible_owner.id=visible_project.owner_id AND visible_owner.status='active'
 LEFT JOIN community_organization_profiles visible_org ON visible_org.organization_id=visible_project.organization_id
 WHERE visible_project.id=${alias}.project_id AND visible_project.visibility='public'
 AND coalesce(visible_org.visibility,'public')='public'))`;
export const orgPermission = (
  orgId: string,
  uid: string | null,
  permission: string,
  db: CommunityDb = pool,
) =>
  uid
    ? hasPermission(
        { userId: uid, organizationId: orgId, permission },
        (text, values) => db.query(text, values),
      )
    : Promise.resolve(false);
export async function orgRole(
  orgId: string,
  uid: string | null,
  db: CommunityDb = pool,
) {
  if (!uid) return null;
  if (
    !orgId ||
    !(await orgPermission(orgId, uid, "community.organization.read", db))
  )
    return null;
  const r = await db.query(
    "SELECT r.key FROM organization_members m JOIN roles r ON r.id=m.role_id WHERE m.organization_id=$1 AND m.user_id=$2 AND m.status='active'",
    [orgId, uid],
  );
  return (r.rows[0]?.key as string | undefined) || null;
}
export async function authorizeOrg(
  db: CommunityDb,
  session: AuthSession,
  id: string,
  level: "member" | "manage" | "owner",
) {
  const found = await db.query(
    "SELECT id FROM organizations WHERE id=$1 FOR UPDATE",
    [id],
  );
  if (!found.rows[0]) throw missing();
  const role = await orgRole(id, session.user.id, db);
  if (
    !role ||
    (level === "manage" &&
      !["organization_owner", "organization_admin"].includes(role)) ||
    (level === "owner" && role !== "organization_owner")
  )
    throw denied();
  if (level !== "member") requireFresh(session, true);
  if (
    level !== "member" &&
    !(await orgPermission(
      id,
      session.user.id,
      level === "owner"
        ? "community.organization.members"
        : "community.organization.manage",
      db,
    ))
  )
    throw denied();
  return role;
}
export async function authorizeProject(
  db: CommunityDb,
  session: AuthSession,
  id: string,
  level: "read" | "contribute" | "edit",
) {
  const r = await db.query(
    `SELECT p.* FROM community_projects p LEFT JOIN community_organization_profiles op ON op.organization_id=p.organization_id
 WHERE p.id=$2 AND ${projectReadWhere()} FOR UPDATE OF p`,
    [session.user.id, id],
  );
  const p = r.rows[0];
  if (!p) throw missing();
  const role = p.organization_id
    ? await orgRole(p.organization_id, session.user.id, db)
    : null;
  const manager =
    (role === "organization_owner" || role === "organization_admin") &&
    (await orgPermission(
      p.organization_id,
      session.user.id,
      "community.organization.manage",
      db,
    ));
  if (level !== "read" && p.organization_id && !role) throw denied();
  const owner =
    p.owner_id === session.user.id && (!p.organization_id || !!role);
  const contributor = await db.query(
    "SELECT 1 FROM community_contributors WHERE project_id=$1 AND user_id=$2 AND status='active'",
    [id, session.user.id],
  );
  if (level === "edit" && !owner && !manager) throw denied();
  if (level === "contribute" && !owner && !manager && !contributor.rows[0])
    throw denied();
  if (manager && !owner && level !== "read") requireFresh(session, true);
  return p;
}
export async function requireCommunityProfile(
  uid: string,
  db: CommunityDb = pool,
) {
  const r = await db.query(
    "SELECT handle,display_name FROM profiles WHERE user_id=$1 AND handle IS NOT NULL",
    [uid],
  );
  if (!r.rows[0])
    throw new ApiError(
      409,
      "COMMUNITY_PROFILE_REQUIRED",
      "Claim a public handle in Profile settings first",
    );
  return r.rows[0] as { handle: string; display_name: string };
}
export async function handleUser(handle: string, db: CommunityDb = pool) {
  const r = await db.query(
    "SELECT p.user_id AS id FROM profiles p JOIN users u ON u.id=p.user_id WHERE p.handle=$1 AND u.status='active'",
    [handle],
  );
  if (!r.rows[0]) throw missing();
  return r.rows[0].id as string;
}
export async function notify(
  db: CommunityDb,
  uid: string,
  actor: string,
  title: string,
  body: string,
  href: string,
) {
  if (uid === actor) return;
  await db.query(
    "INSERT INTO notifications(user_id,title,body,href) SELECT $1,$2,$3,$4 WHERE NOT EXISTS(SELECT 1 FROM notifications WHERE user_id=$1 AND title=$2 AND body=$3 AND href=$4 AND created_at>now()-interval '10 minutes')",
    [uid, title.slice(0, 200), body.slice(0, 1000), href],
  );
}
export async function recordActivity(
  db: CommunityDb,
  uid: string,
  type: string,
  title: string,
  href: string,
  resourceId: string,
  organizationId: string | null = null,
) {
  await db.query(
    "INSERT INTO events(actor_user_id,organization_id,type,payload) VALUES($1,$2,$3,$4::jsonb)",
    [
      uid,
      organizationId,
      `community.${type}`,
      JSON.stringify({ title, href, resourceId }),
    ],
  );
}

/** Deleting a project clears post FKs. Never let that silently publish hidden posts. */
export async function assertNoHiddenLinkedPosts(
  db: CommunityDb,
  projectIds: string[],
) {
  if (!projectIds.length) return;
  const linked = await db.query(
    `SELECT p.id FROM community_posts p WHERE p.project_id=ANY($1::uuid[])
     AND NOT ${postReadWhere()} LIMIT 1 FOR UPDATE OF p`,
    [projectIds],
  );
  if (linked.rows[0])
    throw new ApiError(
      409,
      "HIDDEN_POSTS_LINKED",
      "This project has hidden linked posts. Their authors must delete them or remove the project links before the project or organization can be deleted.",
    );
}
