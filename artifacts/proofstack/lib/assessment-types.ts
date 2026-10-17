/** Platform skill checks are self-directed, not proctored or expert verification. */
export type AssessmentSummary = {
  id: string;
  title: string;
  skill: string;
  description: string;
  questionCount: number;
  durationMinutes: number;
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
