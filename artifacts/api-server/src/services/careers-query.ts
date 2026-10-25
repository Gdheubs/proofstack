import { pool } from "@workspace/db";
import type { CareerData } from "@workspace/api-zod";
import { z } from "zod/v3";
import { ApiError } from "../lib/errors";
import {
  id,
  short,
  managerWhere,
  proofs,
  fail,
  proofBatch,
} from "./careers-policy";
import {
  projectReadWhere,
  memberAccessWhere,
  missing,
} from "./community-policy";
const query = z
  .object({
    view: z.enum([
      "jobs",
      "job",
      "talent",
      "dashboard",
      "applications",
      "application",
      "project-work",
    ]),
    id: id.optional(),
    projectId: id.optional(),
    scope: z.enum(["mine", "received"]).optional(),
    q: short(120).optional(),
    kind: z.enum(["job", "internship", "contract", "collaboration"]).optional(),
    workplace: z.enum(["remote", "hybrid", "onsite"]).optional(),
    availability: z.enum(["open", "exploring"]).optional(),
    skill: short(60).optional(),
    offset: z.coerce.number().int().min(0).max(10000).default(0),
  })
  .strict();
export async function getCareers(
  raw: unknown,
  uid: string | null,
): Promise<CareerData> {
  const parsed = query.safeParse(raw);
  if (!parsed.success) throw fail("Invalid career query.");
  const d = parsed.data;
  const out: CareerData = {
    jobs: [],
    candidates: [],
    applications: [],
    messages: [],
    issues: [],
    organizations: [],
    ownProjects: [],
    assignees: [],
    profile: null,
    projectTitle: "",
    canManageProject: false,
    canContribute: false,
    hasMore: false,
    offset: d.offset,
  };
  const privateView = ["dashboard", "applications", "application"].includes(
    d.view,
  );
  if (privateView && !uid)
    throw new ApiError(401, "AUTH_REQUIRED", "Sign in to continue.");
  const page = <T>(rows: T[]) => {
    out.hasMore = rows.length > 20;
    return rows.slice(0, 20);
  };
  if (d.view === "jobs" || d.view === "job" || d.view === "dashboard") {
    if (d.view === "job" && !d.id) throw fail("Opportunity ID required.");
    const r = await pool.query(
      `SELECT j.id,j.organization_id AS "organizationId",o.name AS "organizationName",o.slug AS "organizationSlug",j.title,j.description,j.skills,j.kind,j.workplace,j.location,j.compensation,j.status,${managerWhere("j.organization_id", "$1")} AS "canManage",EXISTS(SELECT 1 FROM career_applications a WHERE a.job_id=j.id AND a.applicant_id=$1) AS applied,CASE WHEN ${managerWhere("j.organization_id", "$1")} THEN (SELECT count(*)::int FROM career_applications a WHERE a.job_id=j.id) ELSE 0 END AS "applicationCount",j.created_at::text AS "createdAt" FROM career_jobs j JOIN organizations o ON o.id=j.organization_id LEFT JOIN community_organization_profiles op ON op.organization_id=o.id WHERE ((j.status='open' AND op.visibility='public') OR ${managerWhere("j.organization_id", "$1")} OR ($2::uuid IS NOT NULL AND EXISTS(SELECT 1 FROM career_applications a WHERE a.job_id=j.id AND a.applicant_id=$1))) AND ($2::uuid IS NULL OR j.id=$2) AND ($3='' OR j.title ILIKE '%'||$3||'%' OR j.description ILIKE '%'||$3||'%' OR j.skills::text ILIKE '%'||$3||'%') AND ($4::text IS NULL OR j.kind=$4) AND ($5::text IS NULL OR j.workplace=$5) AND ($6::boolean=false OR ${managerWhere("j.organization_id", "$1")}) ORDER BY j.created_at DESC,j.id DESC LIMIT 21 OFFSET $7`,
      [
        uid,
        d.id ?? null,
        d.q ?? "",
        d.kind ?? null,
        d.workplace ?? null,
        d.view === "dashboard",
        d.offset,
      ],
    );
    out.jobs = page(r.rows);
    if (d.view === "job" && !out.jobs.length) throw missing();
  }
  if (d.view === "dashboard" && uid) {
    out.organizations = (
      await pool.query(
        `SELECT o.id,o.name FROM organizations o WHERE ${managerWhere("o.id", "$1")} ORDER BY o.name LIMIT 100`,
        [uid],
      )
    ).rows;
    out.ownProjects = await proofs(uid);
    const p = (
      await pool.query(
        `SELECT headline,roles,availability,discoverable,featured_projects AS "featuredProjects" FROM career_profiles WHERE user_id=$1`,
        [uid],
      )
    ).rows[0];
    out.profile = p ?? {
      headline: "",
      roles: [],
      availability: "closed",
      discoverable: false,
      featuredProjects: [],
    };
  }
  if (d.view === "job" && uid) out.ownProjects = await proofs(uid);
  if (d.view === "talent") {
    const rows = page(
      (
        await pool.query(
          `SELECT p.user_id AS id,p.handle,p.display_name AS "displayName",coalesce(p.avatar_url,'') AS "avatarPath",p.bio,p.skills,c.headline,c.roles,c.availability,c.featured_projects FROM career_profiles c JOIN profiles p ON p.user_id=c.user_id JOIN users u ON u.id=p.user_id AND u.status='active' WHERE c.discoverable AND c.availability<>'closed' AND p.handle IS NOT NULL AND ($3::uuid IS NOT NULL OR p.visibility='public') AND ($1='' OR p.display_name ILIKE '%'||$1||'%' OR c.headline ILIKE '%'||$1||'%' OR p.skills::text ILIKE '%'||$1||'%' OR c.roles::text ILIKE '%'||$1||'%') AND ($4::text IS NULL OR c.availability=$4) AND ($5='' OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p.skills) s WHERE s ILIKE '%'||$5||'%')) ORDER BY c.updated_at DESC,c.user_id LIMIT 21 OFFSET $2`,
          [d.q ?? "", d.offset, uid, d.availability ?? null, d.skill ?? ""],
        )
      ).rows,
    );
    const evidence = await proofBatch(
      rows.map((c) => ({ key: c.id, uid: c.id, ids: c.featured_projects })),
    );
    out.candidates = rows.map((c) => {
      const { featured_projects: _ids, ...candidate } = c;
      return { ...candidate, projects: evidence.get(c.id) ?? [] };
    });
  }
  if (d.view === "applications" || d.view === "application") {
    if (d.view === "application" && !d.id)
      throw fail("Application ID required.");
    const rows = page(
      (
        await pool.query(
          `SELECT a.id,a.job_id AS "jobId",j.title AS "jobTitle",o.id AS "organizationId",o.name AS "organizationName",a.applicant_id AS "applicantId",p.display_name AS "displayName",p.handle,a.note,a.status,a.project_ids,${managerWhere("o.id", "$1")} AS "canManage",a.applicant_id=$1 AS "isMine",a.created_at::text AS "createdAt" FROM career_applications a JOIN career_jobs j ON j.id=a.job_id JOIN organizations o ON o.id=j.organization_id JOIN profiles p ON p.user_id=a.applicant_id WHERE (a.applicant_id=$1 OR ${managerWhere("o.id", "$1")}) AND ($2::uuid IS NULL OR a.id=$2) AND ($3::uuid IS NULL OR a.job_id=$3) AND ($4::boolean=false OR ${managerWhere("o.id", "$1")}) AND ($5::boolean=false OR a.applicant_id=$1) ORDER BY a.created_at DESC,a.id DESC LIMIT 21 OFFSET $6`,
          [
            uid,
            d.view === "application" ? d.id : null,
            d.view === "applications" ? (d.id ?? null) : null,
            d.scope === "received",
            d.scope === "mine",
            d.offset,
          ],
        )
      ).rows,
    );
    const evidence = await proofBatch(
      rows.map((a) => ({ key: a.id, uid: a.applicantId, ids: a.project_ids })),
    );
    out.applications = rows.map((a) => {
      const { project_ids: _ids, ...application } = a;
      return { ...application, projects: evidence.get(a.id) ?? [] };
    });
    if (d.view === "application") {
      if (!out.applications.length) throw missing();
      out.messages = (
        await pool.query(
          `SELECT m.id,m.author_id AS "authorId",p.display_name AS "displayName",m.body,m.created_at::text AS "createdAt" FROM career_messages m JOIN profiles p ON p.user_id=m.author_id WHERE m.application_id=$1 ORDER BY m.created_at DESC,m.id DESC LIMIT 100`,
          [d.id],
        )
      ).rows.reverse();
    }
  }
  if (d.view === "project-work") {
    if (!d.projectId) throw fail("Project ID required.");
    const p = (
      await pool.query(
        `SELECT p.*,((p.owner_id=$1 AND (p.organization_id IS NULL OR ${memberAccessWhere("p.organization_id", "$1")})) OR ${managerWhere("p.organization_id", "$1")}) AS manager,EXISTS(SELECT 1 FROM community_contributors c WHERE c.project_id=p.id AND c.user_id=$1 AND c.status='active') AS contributor FROM community_projects p JOIN users u ON u.id=p.owner_id AND u.status='active' LEFT JOIN community_organization_profiles op ON op.organization_id=p.organization_id WHERE p.id=$2 AND ${projectReadWhere()}`,
        [uid, d.projectId],
      )
    ).rows[0];
    if (!p) throw missing();
    out.projectTitle = p.title;
    out.canManageProject = !!p.manager;
    const member =
      !p.organization_id ||
      (
        await pool.query(`SELECT 1 WHERE ${memberAccessWhere("$1", "$2")}`, [
          p.organization_id,
          uid,
        ])
      ).rows.length > 0;
    out.canContribute = !!uid && member && (p.manager || p.contributor);
    out.issues = page(
      (
        await pool.query(
          `SELECT i.id,i.project_id AS "projectId",i.author_id AS "authorId",a.display_name AS "authorName",i.assignee_id AS "assigneeId",b.display_name AS "assigneeName",i.title,i.description,i.status,i.evidence_url AS "evidenceUrl",($3::boolean AND ($4::boolean OR i.author_id=$2 OR i.assignee_id=$2)) AS "canEdit",i.created_at::text AS "createdAt" FROM project_issues i JOIN profiles a ON a.user_id=i.author_id LEFT JOIN profiles b ON b.user_id=i.assignee_id WHERE i.project_id=$1 ORDER BY i.created_at DESC,i.id DESC LIMIT 21 OFFSET $5`,
          [d.projectId, uid, out.canContribute, out.canManageProject, d.offset],
        )
      ).rows,
    );
    if (out.canContribute)
      out.assignees = (
        await pool.query(
          `SELECT p.user_id AS id,p.display_name AS "displayName" FROM profiles p JOIN users u ON u.id=p.user_id AND u.status='active' WHERE (p.user_id=$2 OR EXISTS(SELECT 1 FROM community_contributors c WHERE c.project_id=$1 AND c.user_id=p.user_id AND c.status='active')) AND ($3::uuid IS NULL OR ${memberAccessWhere("$3", "p.user_id")}) ORDER BY p.display_name LIMIT 100`,
          [d.projectId, p.owner_id, p.organization_id],
        )
      ).rows;
  }
  return out;
}
