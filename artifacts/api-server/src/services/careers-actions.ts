import type { Request } from "express";
import { transaction, audit, type AuthSession } from "./auth-sessions";
import {
  memberAccessWhere,
  authorizeOrg,
  authorizeProject,
  requireCommunityProfile,
  denied,
  missing,
  notify,
  orgRole,
  orgPermission,
} from "./community-policy";
import { careerInput } from "./careers-input";
import {
  validateProofs,
  managerWhere,
  fail,
  transitions,
} from "./careers-policy";
export async function runCareerAction(
  req: Request,
  s: AuthSession,
  raw: unknown,
) {
  const d = careerInput(raw),
    uid = s.user.id;
  return transaction(async (db) => {
    await requireCommunityProfile(uid, db);
    let resultId: string | undefined;
    if (d.action === "career-save") {
      await validateProofs(uid, d.featuredProjects, db);
      await db.query(
        `INSERT INTO career_profiles(user_id,headline,roles,availability,discoverable,featured_projects) VALUES($1,$2,$3::jsonb,$4,$5,$6::jsonb) ON CONFLICT(user_id) DO UPDATE SET headline=excluded.headline,roles=excluded.roles,availability=excluded.availability,discoverable=excluded.discoverable,featured_projects=excluded.featured_projects,updated_at=now()`,
        [
          uid,
          d.headline,
          JSON.stringify(d.roles),
          d.availability,
          d.discoverable,
          JSON.stringify(d.featuredProjects),
        ],
      );
    } else if (d.action === "job-save") {
      await authorizeOrg(db, s, d.organizationId, "manage");
      if (d.status === "open") {
        const o = await db.query(
          `SELECT 1 FROM community_organization_profiles WHERE organization_id=$1 AND visibility='public'`,
          [d.organizationId],
        );
        if (!o.rows.length)
          throw fail(
            "Publish the organization profile before opening opportunities.",
          );
      }
      const v = [
        d.organizationId,
        uid,
        d.title,
        d.description,
        JSON.stringify(d.skills),
        d.kind,
        d.workplace,
        d.location,
        d.compensation,
        d.status,
      ];
      if (d.id) {
        const r = await db.query(
          `UPDATE career_jobs SET title=$3,description=$4,skills=$5::jsonb,kind=$6,workplace=$7,location=$8,compensation=$9,status=$10,updated_at=now() WHERE id=$11 AND organization_id=$1 AND $2::uuid IS NOT NULL RETURNING id`,
          [...v, d.id],
        );
        if (!r.rows.length) throw missing();
        resultId = d.id;
      } else
        resultId = (
          await db.query(
            `INSERT INTO career_jobs(organization_id,creator_id,title,description,skills,kind,workplace,location,compensation,status) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10) RETURNING id`,
            v,
          )
        ).rows[0].id;
    } else if (d.action === "apply") {
      const j = (
        await db.query(
          `SELECT j.*,${managerWhere("j.organization_id", "$2")} AS manager FROM career_jobs j JOIN community_organization_profiles op ON op.organization_id=j.organization_id AND op.visibility='public' WHERE j.id=$1 AND j.status='open' FOR UPDATE OF j`,
          [d.jobId, uid],
        )
      ).rows[0];
      if (!j) throw missing();
      if (j.manager)
        throw fail("You cannot apply to an opportunity you manage.");
      await validateProofs(uid, d.projectIds, db);
      resultId = (
        await db.query(
          `INSERT INTO career_applications(job_id,applicant_id,note,project_ids) VALUES($1,$2,$3,$4::jsonb) RETURNING id`,
          [d.jobId, uid, d.note, JSON.stringify(d.projectIds)],
        )
      ).rows[0].id;
    } else if (d.action === "application-status" || d.action === "message") {
      const a = (
        await db.query(
          `SELECT a.*,j.organization_id,${managerWhere("j.organization_id", "$2")} AS manager FROM career_applications a JOIN career_jobs j ON j.id=a.job_id WHERE a.id=$1 FOR UPDATE OF a`,
          [d.id, uid],
        )
      ).rows[0];
      if (!a || (a.applicant_id !== uid && !a.manager)) throw missing();
      if (d.action === "application-status") {
        if (d.status === "withdrawn") {
          if (a.applicant_id !== uid) throw denied();
          if (a.status === "withdrawn") throw fail("Already withdrawn.");
        } else {
          await authorizeOrg(db, s, a.organization_id, "manage");
          if (!transitions[a.status]?.includes(d.status))
            throw fail("This application cannot move to that stage.");
        }
        await db.query(
          `UPDATE career_applications SET status=$2,updated_at=now() WHERE id=$1`,
          [d.id, d.status],
        );
        await notify(
          db,
          a.applicant_id,
          uid,
          "Application updated",
          `Your application is now ${d.status}.`,
          `/applications/${d.id}`,
        );
      } else {
        if (["withdrawn", "rejected"].includes(a.status))
          throw fail("This conversation is closed.");
        await db.query(
          `INSERT INTO career_messages(application_id,author_id,body) VALUES($1,$2,$3)`,
          [d.id, uid, d.body],
        );
        await notify(
          db,
          a.applicant_id,
          uid,
          "Application message",
          "A hiring team sent you a message.",
          `/applications/${d.id}`,
        );
      }
      resultId = d.id;
    } else {
      const p = await authorizeProject(db, s, d.projectId, "contribute");
      const role = p.organization_id
        ? await orgRole(p.organization_id, uid, db)
        : null;
      const manager =
        p.owner_id === uid ||
        (["organization_owner", "organization_admin"].includes(role ?? "") &&
          (await orgPermission(
            p.organization_id,
            uid,
            "community.organization.manage",
            db,
          )));
      const old = d.id
        ? (
            await db.query(
              "SELECT * FROM project_issues WHERE id=$1 AND project_id=$2 FOR UPDATE",
              [d.id, d.projectId],
            )
          ).rows[0]
        : null;
      if (d.id && !old) throw missing();
      if (old && !manager && old.author_id !== uid && old.assignee_id !== uid)
        throw denied();
      if (
        !manager &&
        d.assigneeId !== (old ? old.assignee_id : uid) &&
        !(!old && d.assigneeId === null)
      )
        throw denied();
      if (d.assigneeId) {
        const eligible = await db.query(
          `SELECT u.id FROM users u WHERE u.id=$1 AND u.status='active' AND (u.id=$2 OR EXISTS(SELECT 1 FROM community_contributors c WHERE c.project_id=$3 AND c.user_id=u.id AND c.status='active')) AND ($4::uuid IS NULL OR ${memberAccessWhere("$4", "u.id")})`,
          [d.assigneeId, p.owner_id, d.projectId, p.organization_id],
        );
        if (!eligible.rows.length)
          throw fail("Assign an active project contributor.");
      }
      const v = [
        d.projectId,
        uid,
        d.assigneeId,
        d.title,
        d.description,
        d.status,
        d.evidenceUrl,
      ];
      if (old) {
        await db.query(
          `UPDATE project_issues SET assignee_id=$3,title=$4,description=$5,status=$6,evidence_url=$7,updated_at=now() WHERE id=$8 AND project_id=$1 AND $2::uuid IS NOT NULL`,
          [...v, d.id],
        );
        resultId = d.id;
      } else
        resultId = (
          await db.query(
            `INSERT INTO project_issues(project_id,author_id,assignee_id,title,description,status,evidence_url) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
            v,
          )
        ).rows[0].id;
    }
    await audit(req, `careers.${d.action}`, uid, resultId, {}, db);
    return {
      message: "Saved successfully",
      ...(resultId ? { id: resultId } : {}),
    };
  });
}
