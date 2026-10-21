import { pool } from "@workspace/db";
import { z } from "zod/v4";
import { ApiError } from "../lib/errors";
import { transaction } from "./auth-sessions";
import {
  assessmentSnapshot,
  questionVersion,
  topicBreakdown,
  type AttemptHistory,
  type SkillSnapshot,
} from "./assessment-questions";
import { RETAKE_COOLDOWN_HOURS } from "./assessment-catalog";
type AttemptRow = {
  id: string;
  assessment_id: string;
  snapshot: SkillSnapshot;
  completed_at: Date | null;
  result: Record<string, unknown> | null;
};
const missing = () =>
  new ApiError(404, "ASSESSMENT_NOT_FOUND", "Skill check or attempt not found");
const invalid = () =>
  new ApiError(
    400,
    "INVALID_ASSESSMENT_INPUT",
    "Check your skill check request",
  );
function attemptView(row: AttemptRow) {
  return {
    id: row.id,
    assessmentId: row.assessment_id,
    title: row.snapshot.title,
    skill: row.snapshot.skill,
    questions: row.snapshot.questions.map((q) => ({
      id: q.id,
      prompt: q.prompt,
      options: q.options.map((o) => ({ id: o.id, label: o.label })),
    })),
    status: row.completed_at
      ? ("completed" as const)
      : ("in_progress" as const),
    ...(row.result ? { result: row.result } : {}),
  };
}
export async function startAssessment(uid: string, raw: unknown) {
  const parsed = z
    .object({ assessmentId: z.string().min(1).max(80) })
    .strict()
    .safeParse(raw);
  if (!parsed.success) throw invalid();
  const assessmentId = parsed.data.assessmentId;
  if (!assessmentSnapshot(assessmentId)) throw missing();
  return transaction(async (tx) => {
    // One start at a time per user and check, so the cooldown cannot be raced.
    await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `assessment:${uid}:${assessmentId}`,
    ]);
    const open = await tx.query<AttemptRow>(
      "SELECT * FROM assessment_attempts WHERE user_id=$1 AND assessment_id=$2 AND completed_at IS NULL",
      [uid, assessmentId],
    );
    if (open.rows[0]) return attemptView(open.rows[0]);
    const { rows: past } = await tx.query<
      AttemptRow & { answers: Record<string, string> }
    >(
      `SELECT * FROM assessment_attempts WHERE user_id=$1 AND assessment_id=$2 AND completed_at IS NOT NULL
      ORDER BY completed_at DESC,id DESC LIMIT 5`,
      [uid, assessmentId],
    );
    const last = past[0]?.completed_at;
    const retakeAt = last
      ? new Date(last).getTime() + RETAKE_COOLDOWN_HOURS * 3600000
      : 0;
    if (retakeAt > Date.now())
      throw new ApiError(
        429,
        "ASSESSMENT_COOLDOWN",
        `You can take this check again after ${new Date(retakeAt).toUTCString()}. Each attempt uses a new question set.`,
      );
    const history: AttemptHistory = past.map((p) => ({
      snapshot: p.snapshot,
      answers: p.answers,
    }));
    const { rows } = await tx.query<AttemptRow>(
      `INSERT INTO assessment_attempts(user_id,assessment_id,question_version,snapshot) VALUES($1,$2,$3,$4::jsonb) RETURNING *`,
      [
        uid,
        assessmentId,
        questionVersion,
        JSON.stringify(assessmentSnapshot(assessmentId, history)),
      ],
    );
    return attemptView(rows[0]!);
  });
}
export async function getAssessmentAttempt(uid: string, id: unknown) {
  if (!z.uuid().safeParse(id).success) throw invalid();
  const { rows } = await pool.query<AttemptRow>(
    "SELECT * FROM assessment_attempts WHERE id=$1 AND user_id=$2",
    [id, uid],
  );
  if (!rows[0]) throw missing();
  return attemptView(rows[0]);
}
export async function submitAssessment(uid: string, id: unknown, raw: unknown) {
  if (!z.uuid().safeParse(id).success) throw invalid();
  const parsed = z
    .object({
      answers: z.record(z.string().min(1).max(80), z.string().min(1).max(80)),
    })
    .strict()
    .safeParse(raw);
  if (!parsed.success) throw invalid();
  return transaction(async (tx) => {
    const { rows } = await tx.query<AttemptRow>(
      "SELECT * FROM assessment_attempts WHERE id=$1 AND user_id=$2 FOR UPDATE",
      [id, uid],
    );
    const row = rows[0];
    if (!row) throw missing();
    if (row.completed_at)
      throw new ApiError(
        409,
        "ASSESSMENT_ALREADY_COMPLETED",
        "This skill check has already been submitted",
      );
    const answers = parsed.data.answers;
    if (
      Object.keys(answers).length !== row.snapshot.questions.length ||
      row.snapshot.questions.some(
        (q) =>
          !Object.hasOwn(answers, q.id) ||
          !q.options.some((o) => o.id === answers[q.id]),
      )
    )
      throw invalid();
    const correct = row.snapshot.questions.filter(
      (q) => parsed.data.answers[q.id] === q.correctOptionId,
    ).length;
    const total = row.snapshot.questions.length;
    const score = Math.round((correct / total) * 100);
    const feedback =
      score >= 80
        ? "Strong foundations demonstrated"
        : score >= 60
          ? "Developing foundations demonstrated"
          : "Foundations need practice";
    const topics = topicBreakdown(row.assessment_id, row.snapshot, answers);
    // Up to two weakest topics guide practice and weight the next attempt.
    const focus = topics
      .filter((t) => t.correct < t.total)
      .sort((a, b) => a.correct / a.total - b.correct / b.total)
      .slice(0, 2)
      .map((t) => t.topic);
    const attempt =
      (
        await tx.query(
          "SELECT count(*)::int AS n FROM assessment_attempts WHERE user_id=$1 AND assessment_id=$2 AND completed_at IS NOT NULL",
          [uid, row.assessment_id],
        )
      ).rows[0].n + 1;
    const completedAt = new Date();
    const result = {
      id: row.id,
      assessmentId: row.assessment_id,
      title: row.snapshot.title,
      skill: row.snapshot.skill,
      score,
      correct,
      total,
      remark: `${feedback} in this self-directed platform skill check; not proctored or expert verification.`,
      completedAt: completedAt.toISOString(),
      attempt,
      topics,
      focus,
    };
    await tx.query(
      "UPDATE assessment_attempts SET answers=$3::jsonb,result=$4::jsonb,completed_at=$5 WHERE id=$1 AND user_id=$2",
      [
        id,
        uid,
        JSON.stringify(parsed.data.answers),
        JSON.stringify(result),
        completedAt,
      ],
    );
    return attemptView({ ...row, result, completed_at: completedAt });
  });
}
export async function getAssessmentResults(uid: string | null, raw: unknown) {
  const parsed = z
    .object({ handle: z.string().min(1).max(80).default("me") })
    .strict()
    .safeParse(raw);
  if (!parsed.success) throw invalid();
  const handle = parsed.data.handle.toLowerCase();
  if (handle === "me" && !uid)
    throw new ApiError(401, "SIGN_IN_REQUIRED", "Sign in to continue");
  // Profile visibility follows community profiles: active user + published handle, or the owner.
  // Visibility and results are read in one statement so an unpublished/disabled profile cannot leak results.
  const { rows } = await pool.query(
    `SELECT COALESCE((SELECT jsonb_agg(latest.result || jsonb_build_object('attempts',latest.attempts) ORDER BY latest.completed_at DESC,latest.id DESC)
    FROM (SELECT DISTINCT ON(a.assessment_id) a.id,a.result,a.completed_at,count(*) OVER(PARTITION BY a.assessment_id)::int AS attempts FROM assessment_attempts a
      WHERE a.user_id=p.user_id AND a.completed_at IS NOT NULL ORDER BY a.assessment_id,a.completed_at DESC,a.id DESC) latest), '[]'::jsonb) AS results
    FROM profiles p JOIN users u ON u.id=p.user_id AND u.status='active'
    WHERE (($1='me' AND p.user_id=$2::uuid) OR ($1<>'me' AND p.handle=$1)) AND (p.handle IS NOT NULL OR p.user_id=$2::uuid)`,
    [handle, uid],
  );
  if (!rows[0]) throw missing();
  return { results: rows[0].results };
}
