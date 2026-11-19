import { Router, type IRouter } from "express";
import { requireCsrf } from "../services/auth-sessions";
import { ApiError } from "../lib/errors";

// Placeholder for grading (/api/skills/grading): queues, blind tasks,
// calibration, appeals and integrity cases. It does no work and returns no
// data until the area is built and switched on.
const router: IRouter = Router();
const unavailable = () =>
  new ApiError(503, "FEATURE_UNAVAILABLE", "This feature is not available yet");

router.get("/skills/grading", () => {
  throw unavailable();
});
router.post("/skills/grading/action", (req) => {
  requireCsrf(req);
  throw unavailable();
});

export default router;
