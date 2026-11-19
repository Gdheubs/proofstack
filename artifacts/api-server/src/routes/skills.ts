import { Router, type IRouter } from "express";
import { requireCsrf } from "../services/auth-sessions";
import { ApiError } from "../lib/errors";

// Placeholder for skill checks (/api/skills): the catalogue, a candidate's
// own views and actions, and the attempt itself. It does no work and returns
// no data until the area is built and switched on.
const router: IRouter = Router();
const unavailable = () =>
  new ApiError(503, "FEATURE_UNAVAILABLE", "This feature is not available yet");

router.get("/skills", () => {
  throw unavailable();
});
router.post("/skills/action", (req) => {
  requireCsrf(req);
  throw unavailable();
});
// The attempt id stays in the path: the limiter has to find the attempt
// before any body is parsed.
router.get("/skills/attempts/:attemptId/state", () => {
  throw unavailable();
});
router.post("/skills/attempts/:attemptId/action", (req) => {
  requireCsrf(req);
  throw unavailable();
});

export default router;
