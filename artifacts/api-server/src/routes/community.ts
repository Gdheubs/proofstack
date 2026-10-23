import express, { Router, type IRouter } from "express";
import { z } from "zod/v3";
import {
  requireCsrf,
  readSession,
  requireAccount,
} from "../services/auth-sessions";
import { authLimit } from "../services/auth-limits";
import { getCommunity } from "../services/community-query";
import { runCommunityAction } from "../services/community-actions";
import { assistCommunity } from "../services/community-ai";
import {
  requestUpload,
  assetAccess,
  storeAssetContent,
  storage,
  IMAGE_TYPES,
  MAX_IMAGE_BYTES,
} from "../services/community-assets";
import { ApiError } from "../lib/errors";
import { publicContent, publicForVisitors } from "../lib/cache-control";
import { ObjectNotFoundError } from "../lib/objectStorage";
const imageId = (raw: unknown) => {
  if (!z.string().uuid().safeParse(raw).success)
    throw new ApiError(404, "IMAGE_NOT_FOUND", "Image not available");
  return String(raw);
};
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
  const data = await getCommunity(req.query, uid);
  // Signed-out visitors all see the same public data.
  if (!session) publicForVisitors(res);
  res.json(data);
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
router.put(
  "/community/assets/:id/content",
  // Authenticate and rate-limit before reading up to 8 MiB of body.
  async (req, res, next) => {
    imageId(req.params.id);
    requireCsrf(req);
    const s = requireAccount(await readSession(req, res));
    await authLimit(req, "community-upload-content", s.user.id, 30, 3600);
    // The body parser would drain an oversized declared body before failing;
    // refuse it unread. Undeclared (chunked) bodies are capped while streaming.
    if (Number(req.get("content-length")) > MAX_IMAGE_BYTES)
      throw new ApiError(
        413,
        "PAYLOAD_TOO_LARGE",
        "Images must be 8 MiB or smaller",
      );
    res.locals.uploaderId = s.user.id;
    next();
  },
  express.raw({
    type: [...IMAGE_TYPES],
    limit: MAX_IMAGE_BYTES,
    inflate: false,
  }),
  async (req, res) => {
    if (!Buffer.isBuffer(req.body))
      throw new ApiError(
        415,
        "INVALID_IMAGE",
        "Upload a PNG, JPEG or WebP image body",
      );
    res.json(
      await storeAssetContent(
        req,
        String(res.locals.uploaderId),
        imageId(req.params.id),
        req.get("content-type"),
        req.body,
      ),
    );
  },
);
router.get("/community/assets/:id", async (req, res) => {
  const id = imageId(req.params.id);
  let access;
  try {
    access = await assetAccess(id, null);
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 404)) throw e;
    const s = requireAccount(await readSession(req, res));
    access = await assetAccess(id, s.user.id);
  }
  let body;
  try {
    body = await storage.read(access.object);
  } catch (e) {
    if (e instanceof ObjectNotFoundError)
      throw new ApiError(404, "IMAGE_NOT_FOUND", "Image not available");
    throw e;
  }
  res.set({
    "Content-Type": access.row.content_type,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'",
  });
  // Public images (published profiles, public projects) may be cached; a
  // private image is never stored outside the browser tab that asked for it.
  if (access.isPublic) publicContent(res, 3600);
  else res.set("Cache-Control", "private, no-store");
  body
    .on("error", (err) => {
      req.log?.error({ errorType: err.name }, "Image stream failed");
      res.destroy();
    })
    .pipe(res);
});
export default router;
