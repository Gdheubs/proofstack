import { Router, type IRouter } from "express";
import { ApiError } from "../lib/errors";

// Placeholder for public credential verification (/api/skills/verify) and
// its public keys. It does no work and returns no data until the area is
// built and switched on.
const router: IRouter = Router();
const unavailable = () =>
  new ApiError(503, "FEATURE_UNAVAILABLE", "This feature is not available yet");

router.get("/skills/verify", () => {
  throw unavailable();
});
router.get("/skills/verify/keys", () => {
  throw unavailable();
});

export default router;
