import { Router, type IRouter } from "express";
import { z } from "zod";
import {
  requireCsrf,
  readSession,
  requireAccount,
} from "../services/auth-sessions";
import { authLimit } from "../services/auth-limits";
import { getCommunity } from "../services/community-query";
import { runCommunityAction } from "../services/community-actions";
import { assistCommunity } from "../services/community-ai";
import { requestUpload, assetAccess } from "../services/community-assets";
import { ApiError } from "../lib/errors";
const router: IRouter = Router();
router.use("/community", (req, res, next) => {
  res.set("Cache-Control", "private, no-store");
  next();
});
router.get("/community", async (req, res) => {
  const session = await readSession(req, res);
  let uid: string | null = null;
  if (session) {
    try {
      uid = requireAccount(session).user.id;
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 403)) throw e;
    }
  }
  res.json(await getCommunity(req.query, uid));
});
router.post("/community/action", async (req, res) => {
  requireCsrf(req);
  const s = requireAccount(await readSession(req, res));
  await authLimit(req, "community-actions", s.user.id, 90, 60);
  try {
    res.json(await runCommunityAction(req, s, req.body));
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && e.code === "23505")
      throw new ApiError(
        409,
        "COMMUNITY_NAME_TAKEN",
        "That handle, slug or team name is already in use",
      );
    throw e;
  }
});
router.post("/community/assist", async (req, res) => {
  requireCsrf(req);
  const s = requireAccount(await readSession(req, res));
  await authLimit(req, "community-ai", s.user.id, 12, 3600);
  res.json(await assistCommunity(req.body));
});
router.post("/community/uploads", async (req, res) => {
  requireCsrf(req);
  const s = requireAccount(await readSession(req, res));
  await authLimit(req, "community-uploads", s.user.id, 30, 3600);
  res.json(await requestUpload(req.body, s.user.id));
});
router.get("/community/assets/:id", async (req, res) => {
  if (!z.string().uuid().safeParse(req.params.id).success)
    throw new ApiError(404, "IMAGE_NOT_FOUND", "Image not available");
  let access;
  try {
    access = await assetAccess(String(req.params.id), null);
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 404)) throw e;
    const s = requireAccount(await readSession(req, res));
    access = await assetAccess(String(req.params.id), s.user.id);
  }
  res.set({
    "Content-Type": access.row.content_type,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'",
    "Cache-Control": "private, no-store",
  });
  access.file
    .createReadStream()
    .on("error", (err) => {
      req.log?.error({ err }, "Image stream failed");
      if (!res.headersSent) res.sendStatus(404);
      else res.destroy();
    })
    .pipe(res);
});
export default router;
