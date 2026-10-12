import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { transaction } from "./auth-sessions";
import { assertJobAccess, type JobRow } from "./intelligence-jobs";
import { lockedRepository } from "./repositories";
import { scanCommit } from "./intelligence-scanner";
import {
  opportunityOutput,
  emptyOutput,
  ownSkills,
  publicOpportunities,
} from "./intelligence-matching";
import {
  intelligenceEnabled,
  intelligenceAiEnabled,
  intelligenceError,
  planSchema,
} from "./intelligence-input";
import {
  requestLearningPlan,
  estimateCostMicros,
} from "./intelligence-provider";
import { ApiError } from "../lib/errors";
import { git } from "./repository-git";
export async function claimIntelligenceJob(): Promise<JobRow | null> {
  if (!intelligenceEnabled() || process.env.MAINTENANCE_MODE === "true")
    return null;
  return transaction(async (db) => {
    // A timed-out provider call is ambiguous: never automatically call it again.
    await db.query(
      `UPDATE intelligence_jobs SET status=CASE WHEN provider_started_at IS NOT NULL OR attempts>=3 THEN 'failed' ELSE 'queued' END,error=CASE WHEN provider_started_at IS NOT NULL THEN 'Provider completion is unknown. Check provider usage before requesting another plan.' WHEN attempts>=3 THEN 'Worker retry limit reached.' ELSE NULL END,finished_at=CASE WHEN provider_started_at IS NOT NULL OR attempts>=3 THEN now() ELSE NULL END,lease_id=NULL,lease_until=NULL,available_at=now()+interval '5 seconds' WHERE status='running' AND lease_until<now()`,
    );
    await db.query(
      `UPDATE intelligence_jobs SET status='failed',error='Job expired before a worker could complete it.',finished_at=now() WHERE status='queued' AND created_at<now()-interval '24 hours'`,
    );
    const j = (
      await db.query<JobRow>(
        `SELECT * FROM intelligence_jobs WHERE status='queued' AND available_at<=now() ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED`,
      )
    ).rows[0];
    if (!j) return null;
    return (
      await db.query<JobRow>(
        "UPDATE intelligence_jobs SET status='running',attempts=attempts+1,lease_id=$2,lease_until=now()+interval '120 seconds',error=NULL WHERE id=$1 RETURNING *",
        [j.id, randomUUID()],
      )
    ).rows[0];
  });
}
export async function processIntelligenceJob(j: JobRow) {
  const active = await pool.query(
    "SELECT 1 FROM intelligence_jobs WHERE id=$1 AND lease_id=$2 AND status='running' AND lease_until>now()",
    [j.id, j.lease_id],
  );
  if (!active.rows.length) return;
  try {
    await assertJobAccess(j);
    const d = j.input;
    let result;
    if (d.kind === "opportunities")
      result = await opportunityOutput(j.user_id, d.workplace);
    else if (d.kind === "security-scan")
      result = await lockedRepository(
        d.repositoryId,
        j.user_id,
        async (repo, path, _db, branches) => {
          if (!repo.canManage)
            throw intelligenceError(
              "Repository access is no longer available.",
              403,
            );
          const branch = branches.find((b) => b.name === d.branch);
          if (!branch)
            throw intelligenceError(
              "The selected branch is no longer available.",
              404,
            );
          // A scan remains pinned to its submitted commit even when the branch advances.
          await git(path, [
            "merge-base",
            "--is-ancestor",
            d.expectedHead,
            branch.head,
          ]);
          return scanCommit(path, d.expectedHead);
        },
      );
    else {
      if (!intelligenceAiEnabled())
        throw intelligenceError("Learning plan provider is unavailable.", 503);
      const skills = await ownSkills(j.user_id),
        target = (await publicOpportunities([d.jobId]))[0];
      if (!target)
        throw intelligenceError(
          "This opportunity is no longer public and open.",
          404,
        );
      const model = process.env.INTELLIGENCE_AI_MODEL!;
      const marked = await pool.query(
        "UPDATE intelligence_jobs SET provider_started_at=now(),model=$3 WHERE id=$1 AND lease_id=$2 AND status='running' AND lease_until>now() AND provider_started_at IS NULL RETURNING id",
        [j.id, j.lease_id, model],
      );
      if (!marked.rowCount) return;
      const response = await requestLearningPlan(skills, target.skills, model);
      // Retain usage even if cancellation won the race or output validation fails.
      await pool.query(
        "UPDATE intelligence_jobs SET prompt_tokens=$3,completion_tokens=$4,estimated_cost_micros=$5 WHERE id=$1 AND lease_id=$2",
        [
          j.id,
          j.lease_id,
          response.promptTokens,
          response.completionTokens,
          estimateCostMicros(response.promptTokens, response.completionTokens),
        ],
      );
      const plan = planSchema.parse(JSON.parse(response.raw));
      result = {
        ...emptyOutput(
          "ai-learning-plan-v1",
          "AI-generated suggestions for your review. Self-reported skills are not verified, and this plan does not establish competence or guarantee an interview or job.",
        ),
        ...plan,
      };
    }
    await assertJobAccess(j);
    await pool.query(
      "UPDATE intelligence_jobs SET status='succeeded',result=$3::jsonb,finished_at=now(),lease_until=NULL WHERE id=$1 AND lease_id=$2 AND status='running' AND lease_until>now()",
      [j.id, j.lease_id, JSON.stringify(result)],
    );
  } catch (e) {
    // Never persist raw provider/Git errors or source data.
    const denied = e instanceof ApiError && [401, 403, 404].includes(e.status);
    const retry =
      j.kind !== "career-plan" &&
      !denied &&
      j.attempts < 3 &&
      !(e instanceof ApiError && e.status < 500);
    const message = denied
      ? "The account or requested resource is no longer accessible."
      : j.kind === "career-plan"
        ? "The provider could not produce a valid plan. Usage may have been incurred. No automatic provider retry was made."
        : "The bounded analysis could not finish. Review repository availability and try again.";
    await pool.query(
      `UPDATE intelligence_jobs SET status=$3,error=$4,finished_at=CASE WHEN $3='failed' THEN now() ELSE NULL END,lease_until=NULL,lease_id=NULL,available_at=now()+interval '10 seconds' WHERE id=$1 AND lease_id=$2 AND status='running' AND lease_until>now()`,
      [j.id, j.lease_id, retry ? "queued" : "failed", message],
    );
  }
}
export async function runIntelligenceOnce() {
  const job = await claimIntelligenceJob();
  if (!job) return false;
  await processIntelligenceJob(job);
  return true;
}
export async function pruneIntelligenceJobs() {
  await pool.query(
    "DELETE FROM service_heartbeats WHERE last_seen_at<now()-interval '1 day'",
  );
  await pool.query(
    "DELETE FROM intelligence_jobs WHERE status IN ('succeeded','failed','cancelled') AND finished_at<now()-interval '30 days'",
  );
  await pool.query(
    "DELETE FROM intelligence_budgets WHERE day<to_char(now()-interval '90 days','YYYY-MM-DD')",
  );
}
