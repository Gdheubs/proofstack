import { Router, type IRouter } from "express";
import { ApiError } from "../lib/errors";

// Placeholder for the mail sender's delivery reports
// (/api/platform/hooks/mail). It does no work and returns no data until the
// mailer is built and configured.
const router: IRouter = Router();

router.post("/platform/hooks/mail", (req) => {
  // The sender's server sets no Origin header; a browser always does on a
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
