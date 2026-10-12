import { Router, type IRouter } from "express";
import {
  readSession,
  requireAccount,
  requireCsrf,
} from "../services/auth-sessions";
import { authLimit } from "../services/auth-limits";
import { getPulls } from "../services/pull-query";
import { runPullAction } from "../services/pull-actions";
import { ApiError } from "../lib/errors";
import { repoError } from "../services/repository-input";
const router: IRouter = Router();
router.use("/pulls", (_req, res, next) => {
  res.set("Cache-Control", "private, no-store");
  next();
});
router.get("/pulls", async (req, res) => {
  const session = await readSession(req, res);
  let uid: string | null = null;
  if (session) {
    try {
      uid = requireAccount(session).user.id;
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 403)) throw e;
    }
  }
  res.json(await getPulls(req.query, uid));
});
router.post("/pulls/action", async (req, res) => {
  requireCsrf(req);
  const s = requireAccount(await readSession(req, res));
  await authLimit(req, "pull-actions", s.user.id, 60, 60);
  try {
    res.json(await runPullAction(req, s, req.body));
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && e.code === "23505")
      throw repoError("This pull request or release already exists.", 409);
    throw e;
  }
});
export default router;
