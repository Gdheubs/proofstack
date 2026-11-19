import { Router, type IRouter } from "express";
import { requireCsrf } from "../services/auth-sessions";
import { ApiError } from "../lib/errors";

// Placeholder for media (/api/media): reservations, image content, playback
// and deletion. It does no work and returns no data until the area is built
// and switched on.
const router: IRouter = Router();
const unavailable = () =>
  new ApiError(503, "FEATURE_UNAVAILABLE", "This feature is not available yet");

router.get("/media", () => {
  throw unavailable();
});
router.post("/media/action", (req) => {
  requireCsrf(req);
  throw unavailable();
});
// Refused before any body byte is read.
router.put("/media/:id/content", (req) => {
  requireCsrf(req);
  throw unavailable();
});
router.get("/media/:id", () => {
  throw unavailable();
});

export default router;
