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
import { publicContent, publicForVisitors } from "../lib/cache-control";
const router: IRouter = Router();
router.get("/assessments", (_req, res) => {
  publicContent(res, 300);
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
  const results = await getAssessmentResults(uid, req.query);
  if (!session) publicForVisitors(res);
  res.json(results);
});
router.post("/assessments/attempts/:id/submit", async (req, res) => {
  requireCsrf(req);
  const session = requireAccount(await readSession(req, res));
  await authLimit(req, "assessment-submit", session.user.id, 30, 600);
  res.json(await submitAssessment(session.user.id, req.params.id, req.body));
});
export default router;
