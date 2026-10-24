import { pool } from "@workspace/db";
import type { Pool } from "pg";
import { ApiError } from "../lib/errors";
import {
  normalizePreferences,
  notificationCategory,
} from "./notification-preferences";
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
// Internal aliases/placeholders only. A stored snapshot is never an access grant.
// Recognize only producer-owned title/destination pairs; unknown legacy rows fail closed.
export const notificationReadWhere = (alias = "n", viewer = "$1") => `(
 ${alias}.user_id=${viewer}::uuid
 AND EXISTS(SELECT 1 FROM users notification_viewer WHERE notification_viewer.id=${viewer}::uuid AND notification_viewer.status='active')
 AND (${alias}.organization_id IS NULL OR ${memberAccessWhere(`${alias}.organization_id`, viewer)})
 AND (
  (${alias}.href='/account' AND (
   ${alias}.title IN ('New device signed in','MFA account recovery')
   OR (${alias}.title='Organization access updated' AND ${alias}.organization_id IS NOT NULL)))
  OR (${alias}.href='/organizations' AND ${alias}.title='Organization membership updated'
   AND ${alias}.body='Your ProofStack organization membership was updated.')
  OR (${alias}.title='New follower' AND ${alias}.href ~ '^/profile/[a-z][a-z0-9_-]{2,31}$'
   AND EXISTS(SELECT 1 FROM profiles notification_profile
    JOIN users notification_person ON notification_person.id=notification_profile.user_id AND notification_person.status='active'
    WHERE '/profile/'||notification_profile.handle=${alias}.href))
  OR (${alias}.title IN ('You were mentioned','New comment','New reaction')
   AND ${alias}.href ~ '^/posts/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   AND EXISTS(SELECT 1 FROM community_posts notification_post
    JOIN users notification_author ON notification_author.id=notification_post.author_id AND notification_author.status='active'
    WHERE '/posts/'||notification_post.id::text=${alias}.href AND ${postReadWhere("notification_post")}))
  OR (${alias}.title='Pull request updated'
   AND ${alias}.href ~ '^/pulls/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   AND EXISTS(SELECT 1 FROM repository_pull_requests notification_pull
    JOIN repositories notification_repo ON notification_repo.id=notification_pull.repository_id
    JOIN community_projects p ON p.id=notification_repo.project_id
    JOIN users notification_owner ON notification_owner.id=p.owner_id AND notification_owner.status='active'
    LEFT JOIN community_organization_profiles op ON op.organization_id=p.organization_id
    WHERE '/pulls/'||notification_pull.id::text=${alias}.href AND ${projectReadWhere(viewer)}))
  OR (${alias}.title IN ('Project contributor invitation','New reaction')
   AND ${alias}.href ~ '^/projects/[a-z0-9]+(-[a-z0-9]+)*$'
   AND EXISTS(SELECT 1 FROM community_projects p
    JOIN users notification_owner ON notification_owner.id=p.owner_id AND notification_owner.status='active'
    LEFT JOIN community_organization_profiles op ON op.organization_id=p.organization_id
    WHERE '/projects/'||p.slug=${alias}.href AND p.created_at<=${alias}.created_at AND ${projectReadWhere(viewer)}
    AND (${alias}.title<>'Project contributor invitation' OR (
     ${alias}.body='You were invited to contribute to '||p.title||'. Accept or decline on the project page.'
     AND EXISTS(SELECT 1 FROM community_contributors notification_invite
     WHERE notification_invite.project_id=p.id AND notification_invite.user_id=${viewer}::uuid
     AND notification_invite.status IN ('pending','active') AND notification_invite.created_at<=${alias}.created_at)))))
  OR (${alias}.title='Organization invitation'
   AND ${alias}.href ~ '^/organizations/[a-z0-9]+(-[a-z0-9]+)*$'
   AND EXISTS(SELECT 1 FROM organizations notification_org
    JOIN organization_invitations notification_org_invite ON notification_org_invite.organization_id=notification_org.id
    WHERE '/organizations/'||notification_org.slug=${alias}.href
    AND ${alias}.body='You are invited to join '||notification_org.name||' on ProofStack. You join only if you accept.'
    AND notification_org_invite.user_id=${viewer}::uuid AND notification_org_invite.declined_at IS NULL
    AND notification_org_invite.expires_at>now() AND notification_org_invite.created_at<=${alias}.created_at))
  OR (${alias}.title IN ('Application updated','Application message')
   AND ${alias}.href ~ '^/applications/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   AND EXISTS(SELECT 1 FROM career_applications notification_application
    WHERE '/applications/'||notification_application.id::text=${alias}.href AND notification_application.applicant_id=${viewer}::uuid))
 )
)`;
export async function notify(
  db: CommunityDb,
  uid: string,
  actor: string,
  title: string,
  body: string,
  href: string,
) {
  if (uid === actor) return;
  // Respect the recipient's per-category switch; security notices bypass it.
  const category = notificationCategory(title);
  if (category) {
    const prefs = (
      await db.query("SELECT notification_prefs FROM users WHERE id=$1", [uid])
    ).rows[0]?.notification_prefs;
    if (!normalizePreferences(prefs)[category].inApp) return;
  }
  await db.query(
    `INSERT INTO notifications(user_id,title,body,href)
     SELECT n.user_id,n.title,n.body,n.href FROM
      (SELECT $1::uuid AS user_id,NULL::uuid AS organization_id,$2::text AS title,$3::text AS body,$4::text AS href,now() AS created_at) n
     WHERE ${notificationReadWhere()}
     AND NOT EXISTS(SELECT 1 FROM notifications previous WHERE previous.user_id=n.user_id AND previous.title=n.title AND previous.body=n.body AND previous.href=n.href AND previous.created_at>now()-interval '10 minutes' AND ${notificationReadWhere("previous")})`,
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
