import { Router, type IRouter } from "express";
import {
  requireAccount,
  readSession,
  requireCsrf,
} from "../services/auth-sessions";
import { authLimit } from "../services/auth-limits";
import {
  getIntelligence,
  runIntelligenceAction,
} from "../services/intelligence-jobs";
import { kickIntelligence } from "../services/intelligence-embedded";
const router: IRouter = Router();
router.use("/intelligence", (_req, res, next) => {
  res.set("Cache-Control", "private, no-store");
  next();
});
router.get("/intelligence", async (req, res) => {
  const s = requireAccount(await readSession(req, res));
  await authLimit(req, "intelligence-read", s.user.id, 120, 60);
  // A member checking on a queued job also moves it along when the worker
  // runs inside the API (see intelligence-embedded.ts).
  void kickIntelligence();
  res.json(await getIntelligence(req.query, s.user.id));
});
router.post("/intelligence/action", async (req, res) => {
  requireCsrf(req);
  const s = requireAccount(await readSession(req, res));
  await authLimit(req, "intelligence-write", s.user.id, 20, 60);
  const result = await runIntelligenceAction(req, s, req.body);
  void kickIntelligence();
  res.json(result);
});
export default router;
