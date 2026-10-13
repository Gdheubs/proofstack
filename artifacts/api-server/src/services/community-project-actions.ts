import type { CommunityAction } from "./community-input";
import { ApiError } from "../lib/errors";
import {
  authorizeProject,
  assertNoHiddenLinkedPosts,
  authorizeOrg,
  orgRole,
  handleUser,
  notify,
  recordActivity,
  missing,
  denied,
  type CommunityDb,
} from "./community-policy";
import type { AuthSession } from "./auth-sessions";
import { assertOwnedAssets } from "./community-assets";
export async function projectAction(
  db: CommunityDb,
  s: AuthSession,
  input: CommunityAction,
) {
  const uid = s.user.id;
  if (input.action === "project-save") {
    const old = input.id
      ? await authorizeProject(db, s, input.id, "edit")
      : null;
    if (old && old.organization_id !== input.organizationId)
      throw new ApiError(
        409,
        "PROJECT_ORGANIZATION_FIXED",
        "An existing project's organization cannot be changed",
      );
    if (input.visibility === "organization" && !input.organizationId)
      throw new ApiError(
        400,
        "ORGANIZATION_REQUIRED",
        "Select an organization for a private project",
      );
    if (input.organizationId) {
      await authorizeOrg(db, s, input.organizationId, "member");
      const setting = (
        await db.query(
          "SELECT visibility FROM community_organization_profiles WHERE organization_id=$1",
          [input.organizationId],
        )
      ).rows[0];
      if (setting?.visibility === "private" && input.visibility === "public")
        throw new ApiError(
          400,
          "PRIVATE_ORGANIZATION",
          "Private organizations can only contain organization-visible projects",
        );
    }
    await assertOwnedAssets(db, uid, input.screenshots, old?.screenshots || []);
    const values = [
      input.slug,
      input.title,
      input.description,
      JSON.stringify(input.technologies),
      JSON.stringify(input.screenshots),
      input.demoUrl,
      input.repositoryUrl,
      input.visibility,
      input.organizationId,
    ];
    const r = input.id
      ? await db.query(
          "UPDATE community_projects SET slug=$1,title=$2,description=$3,technologies=$4::jsonb,screenshots=$5::jsonb,demo_url=$6,repository_url=$7,visibility=$8,organization_id=$9,updated_at=now() WHERE id=$10 RETURNING id",
          [...values, input.id],
        )
      : await db.query(
          "INSERT INTO community_projects(slug,title,description,technologies,screenshots,demo_url,repository_url,visibility,organization_id,owner_id) VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8,$9,$10) RETURNING id",
          [...values, uid],
        );
    const id = r.rows[0].id as string;
    if (!old) {
      await db.query(
        "INSERT INTO community_contributors(project_id,user_id,status) VALUES($1,$2,'active')",
        [id, uid],
      );
      await recordActivity(
        db,
        uid,
        "project-created",
        `Created ${input.title}`,
        `/projects/${input.slug}`,
        id,
        input.organizationId,
      );
    }
    return {
      message: old ? "Project updated" : "Project created",
      id,
      slug: input.slug,
    };
  }
  if (input.action === "project-delete") {
    await authorizeProject(db, s, input.id, "edit");
    await assertNoHiddenLinkedPosts(db, [input.id]);
    await db.query(
      "DELETE FROM community_bookmarks WHERE target_type='project' AND target_id=$1",
      [input.id],
    );
    await db.query(
      "DELETE FROM events WHERE type LIKE 'community.project%' AND payload->>'resourceId'=$1",
      [input.id],
    );
    // Posts stay independent; the deleted project's link is cleared by FK.
    await db.query("DELETE FROM community_projects WHERE id=$1", [input.id]);
    return { message: "Project deleted" };
  }
  if (input.action === "contributor-invite") {
    const p = await authorizeProject(db, s, input.projectId, "edit");
    const target = await handleUser(input.handle, db);
    if (target === uid || target === p.owner_id)
      throw new ApiError(
        400,
        "ALREADY_CONTRIBUTOR",
        "The project owner is already a contributor",
      );
    if (p.organization_id && !(await orgRole(p.organization_id, target, db)))
      throw new ApiError(
        400,
        "ORGANIZATION_MEMBER_REQUIRED",
        "Organization projects can only invite active organization members",
      );
    const count = (
      await db.query(
        "SELECT count(*)::int AS n FROM community_contributors WHERE project_id=$1",
        [p.id],
      )
    ).rows[0].n;
    if (count >= 100)
      throw new ApiError(
        409,
        "CONTRIBUTOR_LIMIT",
        "This project has reached its contributor limit",
      );
    const added = await db.query(
      "INSERT INTO community_contributors(project_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING user_id",
      [p.id, target],
    );
    if (added.rowCount)
      await notify(
        db,
        target,
        uid,
        "Project contributor invitation",
        `You were invited to contribute to ${p.title}. Accept or decline on the project page.`,
        `/projects/${p.slug}`,
      );
    return {
      message: added.rowCount
        ? "Contributor invitation sent"
        : "Developer already invited or contributing",
      id: p.id,
    };
  }
  if (input.action === "contributor-respond") {
    await authorizeProject(db, s, input.projectId, "read");
    const invite = await db.query(
      "SELECT status FROM community_contributors WHERE project_id=$1 AND user_id=$2 FOR UPDATE",
      [input.projectId, uid],
    );
    if (invite.rows[0]?.status !== "pending") throw missing();
    if (input.accept)
      await db.query(
        "UPDATE community_contributors SET status='active' WHERE project_id=$1 AND user_id=$2",
        [input.projectId, uid],
      );
    else
      await db.query(
        "DELETE FROM community_contributors WHERE project_id=$1 AND user_id=$2",
        [input.projectId, uid],
      );
    return {
      message: input.accept ? "Invitation accepted" : "Invitation declined",
    };
  }
  if (input.action === "contributor-remove") {
    const p = await authorizeProject(
      db,
      s,
      input.projectId,
      input.targetId === uid ? "read" : "edit",
    );
    if (input.targetId === p.owner_id)
      throw new ApiError(
        409,
        "OWNER_CONTRIBUTOR_REQUIRED",
        "The project owner remains a contributor",
      );
    await db.query(
      "DELETE FROM community_contributors WHERE project_id=$1 AND user_id=$2",
      [p.id, input.targetId],
    );
    return { message: "Contributor removed" };
  }
  if (input.action === "entry-save") {
    let manager = false;
    if (input.projectId) {
      await authorizeProject(db, s, input.projectId, "contribute");
      if (
        !["release", "documentation", "evidence", "repository"].includes(
          input.kind,
        )
      )
        throw new ApiError(
          400,
          "INVALID_RECORD_KIND",
          "Choose a project record type",
        );
    } else if (input.organizationId) {
      await authorizeOrg(db, s, input.organizationId, "manage");
      manager = true;
      if (input.kind !== "repository")
        throw new ApiError(
          400,
          "INVALID_RECORD_KIND",
          "Organization records are repositories",
        );
    } else if (["release", "documentation"].includes(input.kind))
      throw new ApiError(
        400,
        "PROJECT_REQUIRED",
        "Releases and documentation belong to a project",
      );
    const existing = input.id
      ? (
          await db.query(
            "SELECT * FROM community_entries WHERE id=$1 FOR UPDATE",
            [input.id],
          )
        ).rows[0]
      : null;
    if (input.id && !existing) throw missing();
    if (
      existing &&
      (existing.project_id !== (input.projectId || null) ||
        existing.organization_id !== (input.organizationId || null))
    )
      throw denied();
    if (existing && existing.user_id !== uid && !manager) {
      if (input.projectId)
        await authorizeProject(db, s, input.projectId, "edit");
      else throw denied();
    }
    if (!existing) {
      const n = (
        await db.query(
          "SELECT count(*)::int AS n FROM community_entries WHERE project_id IS NOT DISTINCT FROM $2::uuid AND organization_id IS NOT DISTINCT FROM $3::uuid AND ($2::uuid IS NOT NULL OR $3::uuid IS NOT NULL OR user_id=$1)",
          [uid, input.projectId || null, input.organizationId || null],
        )
      ).rows[0].n;
      if (n >= 100)
        throw new ApiError(
          409,
          "RECORD_LIMIT",
          "This profile, project or organization has reached its 100-record limit",
        );
    }
    const payload = {
      title: input.title,
      description: input.description,
      url: input.url,
      subtitle: input.subtitle,
      technologies: input.technologies,
      startDate: input.startDate,
      endDate: input.endDate,
      version: input.version,
      aiAssisted: input.aiAssisted,
    };
    const r = input.id
      ? await db.query(
          "UPDATE community_entries SET kind=$2,data=$3::jsonb,updated_at=now() WHERE id=$1 RETURNING id",
          [input.id, input.kind, JSON.stringify(payload)],
        )
      : await db.query(
          "INSERT INTO community_entries(user_id,project_id,organization_id,kind,data) VALUES($1,$2,$3,$4,$5::jsonb) RETURNING id",
          [
            uid,
            input.projectId || null,
            input.organizationId || null,
            input.kind,
            JSON.stringify(payload),
          ],
        );
    const id = r.rows[0].id as string;
    if (!existing && !input.projectId && !input.organizationId) {
      const handle = (
        await db.query("SELECT handle FROM profiles WHERE user_id=$1", [uid])
      ).rows[0].handle;
      await recordActivity(
        db,
        uid,
        "entry-created",
        `Added ${input.kind}: ${input.title}`,
        `/profile/${handle}`,
        id,
      );
    }
    return { message: existing ? "Record updated" : "Record added", id };
  }
  if (input.action === "entry-delete") {
    const existing = (
      await db.query("SELECT * FROM community_entries WHERE id=$1 FOR UPDATE", [
        input.id,
      ])
    ).rows[0];
    if (!existing) throw missing();
    if (existing.project_id) {
      await authorizeProject(db, s, existing.project_id, "contribute");
      if (existing.user_id !== uid)
        await authorizeProject(db, s, existing.project_id, "edit");
    } else if (existing.organization_id)
      await authorizeOrg(db, s, existing.organization_id, "manage");
    else if (existing.user_id !== uid) throw denied();
    await db.query("DELETE FROM community_entries WHERE id=$1", [input.id]);
    await db.query(
      "DELETE FROM events WHERE type LIKE 'community.entry%' AND payload->>'resourceId'=$1",
      [input.id],
    );
    return { message: "Record deleted" };
  }
  return null;
}
