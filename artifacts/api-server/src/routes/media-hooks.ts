import { Router, type IRouter } from "express";
import { ApiError } from "../lib/errors";

// Placeholder for the video provider's status reports
// (/api/media/hooks/video). It does no work and returns no data until hosted
// video is built and configured.
const router: IRouter = Router();

router.post("/media/hooks/video", (req) => {
  // The provider's server sets no Origin header; a browser always does on a
  // POST, and no page has a reason to call this address.
  if (req.get("origin"))
    throw new ApiError(
      403,
      "CSRF_REJECTED",
      "Reload this page before trying again",
    );
  throw new ApiError(
    503,
    "FEATURE_UNAVAILABLE",
    "This feature is not available yet",
  );
});

export default router;
