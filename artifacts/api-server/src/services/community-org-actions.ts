import type { CommunityAction } from "./community-input";
import {
  authorizeOrg,
  assertNoHiddenLinkedPosts,
  handleUser,
  notify,
  missing,
  type CommunityDb,
} from "./community-policy";
import { requireFresh, type AuthSession } from "./auth-sessions";
import { ApiError } from "../lib/errors";
import { adminClient, providerFailure } from "./auth-provider";
export async function organizationAction(
  db: CommunityDb,
  s: AuthSession,
  input: CommunityAction,
) {
  const uid = s.user.id;
  if (input.action === "organization-save") {
    requireFresh(s, true);
    if (input.id) await authorizeOrg(db, s, input.id, "manage");
    await db.query(
      "INSERT INTO roles(key,name) VALUES('organization_owner','Organization Owner'),('organization_admin','Organization Admin'),('organization_member','Organization Member') ON CONFLICT(key) DO NOTHING",
    );
    const r = input.id
      ? await db.query(
          "UPDATE organizations SET name=$2,slug=$3,updated_at=now() WHERE id=$1 RETURNING id",
          [input.id, input.name, input.slug],
        )
      : await db.query(
          "INSERT INTO organizations(name,slug) VALUES($1,$2) RETURNING id",
          [input.name, input.slug],
        );
    const id = r.rows[0].id as string;
    if (!input.id)
      await db.query(
        "INSERT INTO organization_members(organization_id,user_id,role_id) SELECT $1,$2,id FROM roles WHERE key='organization_owner'",
        [id, uid],
      );
    await db.query(
      "INSERT INTO community_organization_profiles(organization_id,description,website,visibility) VALUES($1,$2,$3,$4) ON CONFLICT(organization_id) DO UPDATE SET description=EXCLUDED.description,website=EXCLUDED.website,visibility=EXCLUDED.visibility",
      [id, input.description, input.website, input.visibility],
    );
    return {
      message: input.id ? "Organization updated" : "Organization created",
      id,
      slug: input.slug,
    };
  }
  if (input.action === "organization-delete") {
    await authorizeOrg(db, s, input.id, "owner");
    // Reject rather than deleting historical posts that might expose former private project content.
    const projects = (
      await db.query(
        "SELECT id FROM community_projects WHERE organization_id=$1",
        [input.id],
      )
    ).rows.map((p) => p.id);
    await assertNoHiddenLinkedPosts(db, projects);
    await db.query(
      "DELETE FROM community_bookmarks WHERE target_type='project' AND target_id=ANY($1::uuid[])",
      [projects],
    );
    await db.query(
      "DELETE FROM events WHERE organization_id=$1 OR (type LIKE 'community.project%' AND payload->>'resourceId'=ANY($2::text[]))",
      [input.id, projects],
    );
    await db.query(
      "UPDATE sessions SET revoked_at=now(),encrypted_credentials=NULL WHERE user_id IN(SELECT user_id FROM organization_members WHERE organization_id=$1 AND status='active')",
      [input.id],
    );
    await db.query("DELETE FROM organizations WHERE id=$1", [input.id]);
    return {
      message:
        "Organization and its teams, repositories and projects deleted. Sign in again.",
    };
  }
  if (input.action === "member-save" || input.action === "member-remove") {
    await authorizeOrg(db, s, input.organizationId, "owner");
    const target =
      input.action === "member-save"
        ? await handleUser(input.handle, db)
        : input.targetId;
    const old = (
      await db.query(
        "SELECT r.key FROM organization_members m JOIN roles r ON r.id=m.role_id WHERE m.organization_id=$1 AND m.user_id=$2 AND m.status='active'",
        [input.organizationId, target],
      )
    ).rows[0]?.key;
    const next = input.action === "member-save" ? input.role : null;
    const owners = (
      await db.query(
        "SELECT count(*)::int AS n FROM organization_members m JOIN roles r ON r.id=m.role_id JOIN users u ON u.id=m.user_id AND u.status='active' WHERE m.organization_id=$1 AND m.status='active' AND r.key='organization_owner'",
        [input.organizationId],
      )
    ).rows[0].n;
    if (
      old === "organization_owner" &&
      next !== "organization_owner" &&
      owners <= 1
    )
      throw new ApiError(
        409,
        "LAST_ORGANIZATION_OWNER",
        "The organization must retain an active owner",
      );
    if (input.action === "member-save") {
      if (next !== "organization_member") {
        const targetUser = (
          await db.query(
            "SELECT auth_subject FROM users WHERE id=$1 AND status='active'",
            [target],
          )
        ).rows[0];
        if (!targetUser) throw missing();
        const native = await adminClient().auth.admin.getUserById(
          targetUser.auth_subject,
        );
        providerFailure(native.error);
        if (
          !native.data.user?.factors?.some(
            (f) =>
              f.status === "verified" &&
              ["totp", "phone"].includes(f.factor_type),
          )
        )
          throw new ApiError(
            409,
            "TARGET_MFA_REQUIRED",
            "The developer must enroll and verify MFA before receiving an owner or admin role",
          );
      }
      const count = (
        await db.query(
          "SELECT count(*)::int AS n FROM organization_members WHERE organization_id=$1 AND status='active'",
          [input.organizationId],
        )
      ).rows[0].n;
      if (!old && count >= 500)
        throw new ApiError(
          409,
          "MEMBER_LIMIT",
          "The organization has reached its member limit",
        );
      await db.query(
        "INSERT INTO roles(key,name) VALUES('organization_member','Organization Member') ON CONFLICT(key) DO NOTHING",
      );
      await db.query(
        `INSERT INTO organization_members(organization_id,user_id,role_id) SELECT $1,$2,id FROM roles WHERE key=$3
    ON CONFLICT(organization_id,user_id) DO UPDATE SET role_id=EXCLUDED.role_id,status='active',updated_at=now()`,
        [input.organizationId, target, next],
      );
      await notify(
        db,
        target,
        uid,
        "Organization membership updated",
        "Your ProofStack organization membership was updated.",
        "/organizations",
      );
    } else {
      if (!old) throw missing();
      await db.query(
        "UPDATE organization_members SET status='inactive',updated_at=now() WHERE organization_id=$1 AND user_id=$2",
        [input.organizationId, target],
      );
      await db.query(
        "DELETE FROM community_team_members WHERE user_id=$1 AND team_id IN(SELECT id FROM community_teams WHERE organization_id=$2)",
        [target, input.organizationId],
      );
      await db.query(
        "DELETE FROM community_contributors WHERE user_id=$1 AND project_id IN(SELECT id FROM community_projects WHERE organization_id=$2) AND project_id NOT IN(SELECT id FROM community_projects WHERE owner_id=$1)",
        [target, input.organizationId],
      );
    }
    if (old !== next)
      await db.query(
        "UPDATE sessions SET revoked_at=now(),encrypted_credentials=NULL WHERE user_id=$1",
        [target],
      );
    return {
      message:
        input.action === "member-save"
          ? "Membership saved. Changed members must sign in again."
          : "Member removed",
    };
  }
  if (input.action === "team-save") {
    await authorizeOrg(db, s, input.organizationId, "manage");
    if (input.id) {
      const old = (
        await db.query(
          "SELECT organization_id FROM community_teams WHERE id=$1 FOR UPDATE",
          [input.id],
        )
      ).rows[0];
      if (!old || old.organization_id !== input.organizationId) throw missing();
    } else {
      const count = (
        await db.query(
          "SELECT count(*)::int AS n FROM community_teams WHERE organization_id=$1",
          [input.organizationId],
        )
      ).rows[0].n;
      if (count >= 50)
        throw new ApiError(
          409,
          "TEAM_LIMIT",
          "This organization has reached its team limit",
        );
    }
    const r = input.id
      ? await db.query(
          "UPDATE community_teams SET name=$2,description=$3 WHERE id=$1 RETURNING id",
          [input.id, input.name, input.description],
        )
      : await db.query(
          "INSERT INTO community_teams(organization_id,name,description) VALUES($1,$2,$3) RETURNING id",
          [input.organizationId, input.name, input.description],
        );
    return {
      message: input.id ? "Team updated" : "Team created",
      id: r.rows[0].id as string,
    };
  }
  if (input.action === "team-delete" || input.action === "team-member") {
    const t = (
      await db.query(
        "SELECT organization_id FROM community_teams WHERE id=$1",
        [input.id],
      )
    ).rows[0];
    if (!t) throw missing();
    await authorizeOrg(db, s, t.organization_id, "manage");
    if (input.action === "team-delete") {
      await db.query("DELETE FROM community_teams WHERE id=$1", [input.id]);
      return { message: "Team deleted" };
    }
    const member = (
      await db.query(
        "SELECT 1 FROM organization_members m JOIN users u ON u.id=m.user_id AND u.status='active' WHERE m.organization_id=$1 AND m.user_id=$2 AND m.status='active'",
        [t.organization_id, input.targetId],
      )
    ).rows[0];
    if (!member)
      throw new ApiError(
        400,
        "ACTIVE_MEMBER_REQUIRED",
        "Only active organization members can join a team",
      );
    if (input.enabled) {
      const count = (
        await db.query(
          "SELECT count(*)::int AS n FROM community_team_members WHERE team_id=$1",
          [input.id],
        )
      ).rows[0].n;
      if (count >= 100)
        throw new ApiError(
          409,
          "TEAM_MEMBER_LIMIT",
          "The team has reached its member limit",
        );
      await db.query(
        "INSERT INTO community_team_members(team_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [input.id, input.targetId],
      );
    } else
      await db.query(
        "DELETE FROM community_team_members WHERE team_id=$1 AND user_id=$2",
        [input.id, input.targetId],
      );
    return {
      message: input.enabled
        ? "Developer added to team"
        : "Developer removed from team",
    };
  }
  return null;
}
