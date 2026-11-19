import { Router, type IRouter } from "express";
import { requireCsrf } from "../services/auth-sessions";
import { ApiError } from "../lib/errors";

// Placeholder for the interview inside an attempt
// (/api/skills/attempts/:attemptId/interview). It does no work and returns
// no data until the area is built and switched on.
const router: IRouter = Router();

router.post("/skills/attempts/:attemptId/interview", (req) => {
  requireCsrf(req);
  throw new ApiError(
    503,
    "FEATURE_UNAVAILABLE",
    "This feature is not available yet",
  );
});

export default router;
