import { Router, type IRouter } from "express";
import {
  requireCsrf,
  readSession,
  requireAccount,
} from "../services/auth-sessions";
import { authLimit } from "../services/auth-limits";
import { getCareers } from "../services/careers-query";
import { runCareerAction } from "../services/careers-actions";
import { ApiError } from "../lib/errors";
const router: IRouter = Router();
router.use("/careers", (req, res, next) => {
  res.set("Cache-Control", "private, no-store");
  next();
});
router.get("/careers", async (req, res) => {
  const session = await readSession(req, res);
  let uid: string | null = null;
  if (session) {
    try {
      uid = requireAccount(session).user.id;
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 403)) throw e;
    }
  }
  res.json(await getCareers(req.query, uid));
});
router.post("/careers/action", async (req, res) => {
  requireCsrf(req);
  const s = requireAccount(await readSession(req, res));
  await authLimit(req, "career-actions", s.user.id, 90, 60);
  try {
    res.json(await runCareerAction(req, s, req.body));
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && e.code === "23505")
      throw new ApiError(
        409,
        "CAREER_CONFLICT",
        "You already applied to this opportunity",
      );
    throw e;
  }
});

export default router;
