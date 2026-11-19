import { Router, type IRouter } from "express";
import { requireCsrf } from "../services/auth-sessions";
import { ApiError } from "../lib/errors";

// Placeholder for skill check authoring (/api/skills/authoring): questions,
// rubrics, tests, review and publishing. It does no work and returns no data
// until the area is built and switched on.
const router: IRouter = Router();
const unavailable = () =>
  new ApiError(503, "FEATURE_UNAVAILABLE", "This feature is not available yet");

router.get("/skills/authoring", () => {
  throw unavailable();
});
router.post("/skills/authoring/action", (req) => {
  requireCsrf(req);
  throw unavailable();
});

export default router;
