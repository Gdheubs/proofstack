export type Assessment = {
  id: string;
  title: string;
  skill: string;
  description: string;
  questionCount: number;
  durationMinutes: number;
  retakeCooldownHours?: number;
};
export type AssessmentQuestion = {
  id: string;
  prompt: string;
  options: { id: string; label: string }[];
};
export type AssessmentResult = {
  id: string;
  assessmentId: string;
  title: string;
  skill: string;
  score: number;
  correct: number;
  total: number;
  remark: string;
  completedAt: string;
  /** Which completed attempt this was; older results omit it. */
  attempt?: number;
  /** Completed attempts in total; present on profile results. */
  attempts?: number;
  topics?: { topic: string; correct: number; total: number }[];
  /** Weakest topics, which the next attempt emphasises. */
  focus?: string[];
};
export type AssessmentAttempt = {
  id: string;
  assessmentId: string;
  title: string;
  skill: string;
  questions: AssessmentQuestion[];
  status: "in_progress" | "completed";
  result?: AssessmentResult;
};
export type AssessmentAnswers = Record<string, string>;
type Request = typeof fetch;

export function createAssessmentActionGuard() {
  let busy = false;
  return {
    async run<T>(action: () => Promise<T>): Promise<T | undefined> {
      if (busy) return undefined;
      busy = true;
      try {
        return await action();
      } finally {
        busy = false;
      }
    },
  };
}

async function assessmentRequest<T>(
  path: string,
  options: RequestInit,
  request: Request,
): Promise<T> {
  const response = await request(`/api/assessments${path}`, {
    credentials: "same-origin",
    cache: "no-store",
    ...options,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(
      payload?.error?.message ??
        `Skill check request failed (${response.status}). Try again.`,
    );
  }
  return response.json() as Promise<T>;
}

export function getAssessmentCatalog(
  signal?: AbortSignal,
  request: Request = fetch,
) {
  return assessmentRequest<{ assessments: Assessment[] }>(
    "",
    { signal },
    request,
  );
}

export function getAssessmentResults(
  handle: string,
  signal?: AbortSignal,
  request: Request = fetch,
) {
  return assessmentRequest<{ results: AssessmentResult[] }>(
    `/results?handle=${encodeURIComponent(handle)}`,
    { signal },
    request,
  );
}

function postOptions(csrf: string, data: unknown): RequestInit {
  if (!csrf)
    throw new Error("Security token unavailable. Reload and try again.");
  return {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
    body: JSON.stringify(data),
  };
}

export async function startAssessment(
  assessmentId: string,
  csrf: string,
  request: Request = fetch,
) {
  return assessmentRequest<AssessmentAttempt>(
    "/start",
    postOptions(csrf, { assessmentId }),
    request,
  );
}

export function getAssessmentAttempt(
  id: string,
  signal?: AbortSignal,
  request: Request = fetch,
) {
  return assessmentRequest<AssessmentAttempt>(
    `/attempts/${encodeURIComponent(id)}`,
    { signal },
    request,
  );
}

export function hasAllAnswers(
  questions: AssessmentQuestion[],
  answers: AssessmentAnswers,
) {
  return (
    questions.length > 0 &&
    questions.every((q) => q.options.some((o) => o.id === answers[q.id]))
  );
}

export async function submitAssessment(
  attempt: AssessmentAttempt,
  answers: AssessmentAnswers,
  csrf: string,
  request: Request = fetch,
) {
  if (!hasAllAnswers(attempt.questions, answers))
    throw new Error("Answer every question before submitting.");
  await assessmentRequest<AssessmentAttempt>(
    `/attempts/${encodeURIComponent(attempt.id)}/submit`,
    postOptions(csrf, { answers }),
    request,
  );
  // Only the server's fresh read of the exact target confirms completion.
  const completed = await getAssessmentAttempt(attempt.id, undefined, request);
  if (
    completed.id !== attempt.id ||
    completed.assessmentId !== attempt.assessmentId ||
    completed.status !== "completed" ||
    !completed.result
  ) {
    throw new Error(
      "Your result is not confirmed yet. Reload this attempt to check its status before trying again.",
    );
  }
  return completed;
}
