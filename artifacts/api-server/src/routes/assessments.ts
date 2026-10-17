import { Router, type IRouter } from "express";
import { assessmentCatalog } from "../services/assessment-catalog";
import {
  startAssessment,
  getAssessmentAttempt,
  submitAssessment,
  getAssessmentResults,
} from "../services/assessments";
import {
  readSession,
  requireAccount,
  requireCsrf,
} from "../services/auth-sessions";
import { authLimit } from "../services/auth-limits";
import { ApiError } from "../lib/errors";
const router: IRouter = Router();
router.get("/assessments", (_req, res) => {
  res.json(assessmentCatalog());
});
router.post("/assessments/start", async (req, res) => {
  requireCsrf(req);
  const session = requireAccount(await readSession(req, res));
  await authLimit(req, "assessment-start", session.user.id, 20, 600);
  res.json(await startAssessment(session.user.id, req.body));
});
router.get("/assessments/attempts/:id", async (req, res) => {
  const session = requireAccount(await readSession(req, res));
  res.json(await getAssessmentAttempt(session.user.id, req.params.id));
});
router.get("/assessments/results", async (req, res) => {
  const session = await readSession(req, res);
  let uid: string | null = null;
  if (session) {
    try {
      uid = requireAccount(session).user.id;
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 403)) throw error;
    }
  }
  res.json(await getAssessmentResults(uid, req.query));
});
router.post("/assessments/attempts/:id/submit", async (req, res) => {
  requireCsrf(req);
  const session = requireAccount(await readSession(req, res));
  await authLimit(req, "assessment-submit", session.user.id, 30, 600);
  res.json(await submitAssessment(session.user.id, req.params.id, req.body));
});
export default router;
