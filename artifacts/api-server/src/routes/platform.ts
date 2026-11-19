import { Router, type IRouter } from "express";
import { requireCsrf } from "../services/auth-sessions";
import { ApiError } from "../lib/errors";

// Placeholder for platform access (/api/platform): grants, organisation
// verification and entitlements. It does no work and returns no data until
// the area is built and switched on.
const router: IRouter = Router();
const unavailable = () =>
  new ApiError(503, "FEATURE_UNAVAILABLE", "This feature is not available yet");

router.get("/platform", () => {
  throw unavailable();
});
router.post("/platform/action", (req) => {
  requireCsrf(req);
  throw unavailable();
});

export default router;
