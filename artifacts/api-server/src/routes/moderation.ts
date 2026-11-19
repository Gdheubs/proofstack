import { Router, type IRouter } from "express";
import { requireCsrf } from "../services/auth-sessions";
import { ApiError } from "../lib/errors";

// Placeholder for moderation (/api/moderation): reports, the review queue
// and restrictions. It does no work and returns no data until the area is
// built and switched on.
const router: IRouter = Router();
const unavailable = () =>
  new ApiError(503, "FEATURE_UNAVAILABLE", "This feature is not available yet");

router.get("/moderation", () => {
  throw unavailable();
});
router.post("/moderation/action", (req) => {
  requireCsrf(req);
  throw unavailable();
});

export default router;
