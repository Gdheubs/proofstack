import { pool } from "@workspace/db";
import { z } from "zod/v4";
import { ApiError } from "../lib/errors";
import { transaction } from "./auth-sessions";
import {
  assessmentSnapshot,
  questionVersion,
  type SkillSnapshot,
} from "./assessment-questions";
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
  const snapshot = assessmentSnapshot(parsed.data.assessmentId);
  if (!snapshot) throw missing();
  const { rows } = await pool.query<AttemptRow>(
    `INSERT INTO assessment_attempts(user_id,assessment_id,question_version,snapshot) VALUES($1,$2,$3,$4::jsonb)
    ON CONFLICT(user_id,assessment_id) WHERE completed_at IS NULL DO UPDATE SET assessment_id=excluded.assessment_id RETURNING *`,
    [uid, parsed.data.assessmentId, questionVersion, JSON.stringify(snapshot)],
  );
  return attemptView(rows[0]!);
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
    `SELECT COALESCE((SELECT jsonb_agg(latest.result ORDER BY latest.completed_at DESC,latest.id DESC)
    FROM (SELECT DISTINCT ON(a.assessment_id) a.id,a.result,a.completed_at FROM assessment_attempts a
      WHERE a.user_id=p.user_id AND a.completed_at IS NOT NULL ORDER BY a.assessment_id,a.completed_at DESC,a.id DESC) latest), '[]'::jsonb) AS results
    FROM profiles p JOIN users u ON u.id=p.user_id AND u.status='active'
    WHERE (($1='me' AND p.user_id=$2::uuid) OR ($1<>'me' AND p.handle=$1)) AND (p.handle IS NOT NULL OR p.user_id=$2::uuid)`,
    [handle, uid],
  );
  if (!rows[0]) throw missing();
  return { results: rows[0].results };
}
