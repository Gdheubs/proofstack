import { Router, type IRouter } from "express";
import { requireCsrf } from "../services/auth-sessions";
import { ApiError } from "../lib/errors";

// Placeholder for skill checks on jobs (/api/careers/checks). It does no
// work and returns no data until the area is built and switched on.
const router: IRouter = Router();
const unavailable = () =>
  new ApiError(503, "FEATURE_UNAVAILABLE", "This feature is not available yet");

router.get("/careers/checks", () => {
  throw unavailable();
});
router.post("/careers/checks/action", (req) => {
  requireCsrf(req);
  throw unavailable();
});

export default router;
