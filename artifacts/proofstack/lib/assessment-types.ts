/** Platform skill checks are self-directed, not proctored or expert verification. */
export type AssessmentSummary = {
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
export type AssessmentCatalogResponse = { assessments: AssessmentSummary[] };
export type AssessmentResultsResponse = { results: AssessmentResult[] };
export type AssessmentStartRequest = { assessmentId: string };
export type AssessmentSubmitRequest = { answers: Record<string, string> };
