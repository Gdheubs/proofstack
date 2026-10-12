import type { Request } from "express";
import type {
  IntelligenceData,
  IntelligenceJob,
  IntelligenceOutput,
} from "@workspace/api-zod";
import { pool } from "@workspace/db";
import {
  transaction,
  audit,
  requireFresh,
  type AuthSession,
} from "./auth-sessions";
import { repositoryAccess } from "./repositories";
import { missing, type CommunityDb } from "./community-policy";
import { managerWhere } from "./careers-policy";
import { memberAccessWhere } from "./community-policy";
import {
  ownSkills,
  publicOpportunities,
  matchOpportunities,
} from "./intelligence-matching";
import {
  intelligenceInput,
  intelligenceQuery,
  intelligenceEnabled,
  intelligenceAiEnabled,
  intelligenceError,
  type IntelligenceInput,
} from "./intelligence-input";
export type EnqueueInput = Extract<IntelligenceInput, { action: "enqueue" }>;
export type JobRow = {
  id: string;
  user_id: string;
  kind: EnqueueInput["kind"];
  status: string;
  input: EnqueueInput;
  repository_id: string | null;
  result: IntelligenceOutput | null;
  attempts: number;
  lease_id: string | null;
  lease_until: Date | null;
  provider_started_at: Date | null;
  model: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  estimated_cost_micros: number | null;
  error: string | null;
  created_at: Date;
  finished_at: Date | null;
  reviewed_at: Date | null;
};
export async function assertJobAccess(
  job: Pick<JobRow, "user_id" | "input" | "repository_id">,
  db: CommunityDb = pool,
) {
  await ownSkills(job.user_id, db);
  if (
    job.repository_id &&
    !(await repositoryAccess(job.repository_id, job.user_id, db)).canManage
  )
    throw missing();
  if (
    job.input.kind === "career-plan" &&
    !(await publicOpportunities([job.input.jobId], db)).length
  )
    throw missing();
}
async function reserve(db: CommunityDb, scope: string, limit: number) {
  const r = await db.query(
    `INSERT INTO intelligence_budgets(scope,day,used) VALUES($1,to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD'),1) ON CONFLICT(scope,day) DO UPDATE SET used=intelligence_budgets.used+1 WHERE intelligence_budgets.used<$2 RETURNING used`,
    [scope, limit],
  );
  if (!r.rows.length)
    throw intelligenceError(
      "Daily intelligence limit reached. Try again after 00:00 UTC.",
      429,
    );
}
export async function runIntelligenceAction(
  req: Request,
  s: AuthSession,
  raw: unknown,
) {
  const parsed = intelligenceInput.safeParse(raw);
  if (!parsed.success)
    throw intelligenceError(
      "Invalid intelligence action. Review the selected options and required consent.",
    );
  const d = parsed.data,
    uid = s.user.id;
  return transaction(async (db) => {
    await ownSkills(uid, db);
    if (d.action !== "enqueue") {
      const j = (
        await db.query<JobRow>(
          "SELECT * FROM intelligence_jobs WHERE id=$1 AND user_id=$2 FOR UPDATE",
          [d.id, uid],
        )
      ).rows[0];
      if (!j) throw missing();
      // Owners may delete or cancel inaccessible work, but cannot mark unseen results reviewed.
      if (d.action === "review") {
        await assertJobAccess(j, db);
        if (j.status !== "succeeded")
          throw intelligenceError(
            "Only completed results can be marked reviewed.",
            409,
          );
        await db.query(
          "UPDATE intelligence_jobs SET reviewed_at=now() WHERE id=$1",
          [j.id],
        );
      } else if (d.action === "cancel") {
        if (!["queued", "running"].includes(j.status))
          throw intelligenceError("This job has already finished.", 409);
        await db.query(
          "UPDATE intelligence_jobs SET status='cancelled',result=NULL,finished_at=now(),lease_until=NULL WHERE id=$1",
          [j.id],
        );
      } else {
        if (
          ["queued", "running"].includes(j.status) ||
          (j.provider_started_at &&
            Date.now() - new Date(j.provider_started_at).getTime() < 120000)
        )
          throw intelligenceError(
            "Cancel or finish this job before deleting it. Provider jobs need up to two minutes to settle usage.",
            409,
          );
        await db.query("DELETE FROM intelligence_jobs WHERE id=$1", [j.id]);
      }
      await audit(req, "intelligence." + d.action, uid, j.id, {}, db);
      return {
        id: j.id,
        message:
          d.action === "review"
            ? "Marked as reviewed"
            : d.action === "cancel"
              ? "Job cancelled. A provider request already in progress may still incur usage."
              : "Job deleted. Daily quota reservations are retained.",
      };
    }
    // Serialize per-account submissions so idempotency, active-job and quota checks are atomic.
    await db.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [uid]);
    const existing = (
      await db.query<JobRow>(
        "SELECT * FROM intelligence_jobs WHERE user_id=$1 AND request_key=$2",
        [uid, d.requestKey],
      )
    ).rows[0];
    if (existing) {
      if (JSON.stringify(existing.input) !== JSON.stringify(d)) {
        // JSONB does not preserve key order.
        const canonical = (v: object) =>
          JSON.stringify(
            Object.entries(v).sort(([a], [b]) => a.localeCompare(b)),
          );
        if (canonical(existing.input) !== canonical(d))
          throw intelligenceError(
            "This request key belongs to a different request.",
            409,
          );
      }
      await assertJobAccess(existing, db);
      return { id: existing.id, message: "Existing job returned" };
    }
    if (!intelligenceEnabled())
      throw intelligenceError(
        "Intelligence jobs are not enabled on this server.",
        503,
      );
    if (d.kind === "career-plan" && !intelligenceAiEnabled())
      throw intelligenceError(
        "An AI provider and model must be configured for learning plans.",
        503,
      );
    if (d.kind === "security-scan") {
      requireFresh(s, true);
      const repo = await repositoryAccess(d.repositoryId, uid, db);
      if (!repo.canManage) throw missing();
      const branch = (
        await db.query(
          "SELECT head FROM repository_branches WHERE repository_id=$1 AND name=$2",
          [d.repositoryId, d.branch],
        )
      ).rows[0];
      if (branch?.head !== d.expectedHead)
        throw intelligenceError(
          "The branch changed. Reload its current commit before requesting a scan.",
          409,
        );
    }
    if (
      d.kind === "career-plan" &&
      !(await publicOpportunities([d.jobId], db)).length
    )
      throw missing();
    const active = (
      await db.query(
        "SELECT count(*)::int AS n FROM intelligence_jobs WHERE user_id=$1 AND status IN ('queued','running')",
        [uid],
      )
    ).rows[0].n;
    if (active >= 2)
      throw intelligenceError(
        "Wait for or cancel an active job first (two active jobs per account).",
        429,
      );
    await reserve(db, "user:" + uid, 20);
    if (d.kind === "career-plan") {
      await reserve(db, "ai:" + uid, 3);
      await reserve(db, "ai:global", 100);
    }
    const row = (
      await db.query(
        "INSERT INTO intelligence_jobs(user_id,request_key,kind,repository_id,input) VALUES($1,$2,$3,$4,$5::jsonb) RETURNING id",
        [
          uid,
          d.requestKey,
          d.kind,
          d.kind === "security-scan" ? d.repositoryId : null,
          JSON.stringify(d),
        ],
      )
    ).rows[0];
    await audit(req, "intelligence.enqueue", uid, row.id, { kind: d.kind }, db);
    return {
      id: row.id as string,
      message:
        "Job queued. Results will appear here when a worker processes it.",
    };
  });
}
function serialize(j: JobRow): IntelligenceJob {
  const date = (v: Date | null) => (v ? new Date(v).toISOString() : null);
  return {
    id: j.id,
    kind: j.kind,
    status: j.status,
    repositoryId: j.repository_id,
    branch: j.input.kind === "security-scan" ? j.input.branch : "",
    commit: j.input.kind === "security-scan" ? j.input.expectedHead : "",
    attempts: j.attempts,
    createdAt: date(j.created_at)!,
    finishedAt: date(j.finished_at),
    reviewedAt: date(j.reviewed_at),
    error: j.error,
    model: j.model,
    promptTokens: j.prompt_tokens,
    completionTokens: j.completion_tokens,
    estimatedCostMicros: j.estimated_cost_micros,
    result: j.result,
  };
}
// Filter security metadata as well as results using current project management permission.
const readable = `(j.repository_id IS NULL OR EXISTS(SELECT 1 FROM repositories r JOIN community_projects p ON p.id=r.project_id JOIN users owner ON owner.id=p.owner_id AND owner.status='active' WHERE r.id=j.repository_id AND ((p.owner_id=$1 AND (p.organization_id IS NULL OR ${memberAccessWhere("p.organization_id", "$1")})) OR ${managerWhere("p.organization_id", "$1")})))`;
export async function getIntelligence(
  raw: unknown,
  uid: string,
): Promise<IntelligenceData> {
  const parsed = intelligenceQuery.safeParse(raw);
  if (!parsed.success) throw intelligenceError("Invalid intelligence query.");
  const d = parsed.data;
  await ownSkills(uid);
  const rows = (
    await pool.query<JobRow>(
      `SELECT j.* FROM intelligence_jobs j WHERE j.user_id=$1 AND ${readable} AND ($2::uuid IS NULL OR j.id=$2) ORDER BY j.created_at DESC,j.id DESC LIMIT 21 OFFSET $3`,
      [uid, d.id ?? null, d.id ? 0 : d.offset],
    )
  ).rows;
  if (d.id && !rows.length) throw missing();
  let job: IntelligenceJob | null = null;
  if (d.id) {
    const row = rows[0];
    await assertJobAccess(row);
    job = serialize(row);
    if (job.result && row.input.kind === "opportunities") {
      const jobs = await publicOpportunities(
        job.result.matches.map((m) => m.id),
      );
      job.result = {
        ...job.result,
        matches: matchOpportunities(
          await ownSkills(uid),
          jobs,
          row.input.workplace,
        ),
        summary:
          "Suggestions below are rechecked against currently public, open opportunities and your current skills. New opportunities require a new run.",
      };
    }
  }
  const usage = (
    await pool.query(
      "SELECT scope,used FROM intelligence_budgets WHERE day=to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD') AND scope=ANY($1::text[])",
      [["user:" + uid, "ai:" + uid]],
    )
  ).rows;
  return {
    enabled: intelligenceEnabled(),
    aiEnabled: intelligenceAiEnabled(),
    jobs: rows.slice(0, 20).map((j) => ({ ...serialize(j), result: null })),
    job,
    usedToday: usage.find((r) => r.scope === "user:" + uid)?.used ?? 0,
    aiUsedToday: usage.find((r) => r.scope === "ai:" + uid)?.used ?? 0,
    dailyLimit: 20,
    aiDailyLimit: 3,
    hasMore: rows.length > 20,
    offset: d.offset,
  };
}
