import { Router, type IRouter } from "express";
import { requireCsrf } from "../services/auth-sessions";
import { ApiError } from "../lib/errors";

// Placeholder for colleges (/api/education): cohorts, enrolment,
// assignments and supervised sittings. It does no work and returns no data
// until the area is built and switched on.
const router: IRouter = Router();
const unavailable = () =>
  new ApiError(503, "FEATURE_UNAVAILABLE", "This feature is not available yet");

router.get("/education", () => {
  throw unavailable();
});
router.post("/education/action", (req) => {
  requireCsrf(req);
  throw unavailable();
});

export default router;
