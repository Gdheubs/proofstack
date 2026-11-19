import { Router, type IRouter } from "express";
import { ApiError } from "../lib/errors";

// Placeholder for the results an organisation may see (/api/org-results).
// It has views only, never actions. It does no work and returns no data
// until the area is built and switched on.
const router: IRouter = Router();

router.get("/org-results", () => {
  throw new ApiError(
    503,
    "FEATURE_UNAVAILABLE",
    "This feature is not available yet",
  );
});

export default router;
