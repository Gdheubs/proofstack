import { Router, type IRouter } from "express";
import express from "express";
import {
  readSession,
  requireAccount,
  requireCsrf,
} from "../services/auth-sessions";
import { authLimit } from "../services/auth-limits";
import { ApiError } from "../lib/errors";
import { rateLimitAddress } from "../lib/client-ip";
import {
  getRepositories,
  runRepositoryAction,
  tokenUser,
  tokenCredential,
  lockedRepository,
  pushRepository,
  validateRepositoryId,
} from "../services/repositories";
import { git } from "../services/repository-git";
import { repoError } from "../services/repository-input";
const router: IRouter = Router();
router.use(["/repositories", "/git"], (_req, res, next) => {
  res.set("Cache-Control", "private, no-store");
  next();
});
router.get("/repositories", async (req, res) => {
  const session = await readSession(req, res);
  let uid: string | null = null;
  if (session) {
    try {
      uid = requireAccount(session).user.id;
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 403)) throw e;
    }
  }
  res.json(await getRepositories(req.query, uid));
});
router.post("/repositories/action", async (req, res) => {
  requireCsrf(req);
  const session = requireAccount(await readSession(req, res));
  await authLimit(req, "repositories", session.user.id, 60, 60);
  try {
    res.json(await runRepositoryAction(req, session, req.body));
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && e.code === "23505")
      throw repoError("This repository or branch already exists.", 409);
    throw e;
  }
});
const gitRequest = async (
  req: express.Request,
  res: express.Response,
  advertise: boolean,
) => {
  const id = await validateRepositoryId(String(req.params.id));
  if (advertise && req.query.service !== "git-upload-pack")
    throw repoError("Only read-only clone/fetch is supported.", 403);
  if (
    !advertise &&
    (!req.is("application/x-git-upload-pack-request") ||
      !Buffer.isBuffer(req.body))
  )
    throw repoError("Expected a Git upload-pack request.", 415);
  res.set("WWW-Authenticate", 'Basic realm="ProofStack read-only Git"');
  const uid = await tokenUser(req.get("authorization"), id);
  await authLimit(req, "git-read", uid ?? rateLimitAddress(req), 60, 60);
  let output: Buffer;
  try {
    output = await lockedRepository(id, uid, async (_repo, path) =>
      git(
        path,
        [
          "upload-pack",
          "--stateless-rpc",
          ...(advertise ? ["--advertise-refs"] : []),
          path,
        ],
        advertise ? "" : req.body,
        {},
        64 * 1024 * 1024,
      ),
    );
  } catch (e) {
    if (e instanceof ApiError && e.status === 404 && !uid)
      throw repoError(
        "Repository unavailable or authentication required.",
        401,
      );
    throw e;
  }
  res.type(
    advertise
      ? "application/x-git-upload-pack-advertisement"
      : "application/x-git-upload-pack-result",
  );
  if (advertise)
    output = Buffer.concat([
      Buffer.from("001e# service=git-upload-pack\n0000"),
      output,
    ]);
  res.send(output);
};
router.get("/git/:id/info/refs", async (req, res) => {
  if (req.query.service !== "git-receive-pack")
    return gitRequest(req, res, true);
  const id = await validateRepositoryId(String(req.params.id));
  const credential = await tokenCredential(req.get("authorization"), id);
  if (!credential) throw repoError("A write token is required.", 401);
  if (credential.scope !== "write")
    throw repoError("This repository token is read-only.", 403);
  await authLimit(req, "git-write", credential.userId, 30, 60);
  const output = await lockedRepository(
    id,
    credential.userId,
    async (repo, path) => {
      if (!repo.canWrite)
        throw repoError("Repository write access was revoked.", 403);
      return git(path, [
        "receive-pack",
        "--stateless-rpc",
        "--advertise-refs",
        path,
      ]);
    },
  );
  const service = "# service=git-receive-pack\n";
  const prefix = Buffer.from(
    (service.length + 4).toString(16).padStart(4, "0") + service,
  );
  res
    .type("application/x-git-receive-pack-advertisement")
    .send(Buffer.concat([prefix, Buffer.from("0000"), output]));
});
router.post(
  "/git/:id/git-upload-pack",
  express.raw({
    type: "application/x-git-upload-pack-request",
    limit: "1mb",
    inflate: false,
  }),
  async (req, res) => gitRequest(req, res, false),
);
router.post(
  "/git/:id/git-receive-pack",
  express.raw({
    type: "application/x-git-receive-pack-request",
    limit: "64mb",
    inflate: false,
  }),
  async (req, res) => {
    const id = await validateRepositoryId(String(req.params.id));
    const credential = await tokenCredential(req.get("authorization"), id);
    if (!credential) throw repoError("A write token is required.", 401);
    if (credential.scope !== "write")
      throw repoError("This repository token is read-only.", 403);
    if (
      !req.is("application/x-git-receive-pack-request") ||
      !Buffer.isBuffer(req.body)
    )
      throw repoError("Expected a Git receive-pack request.", 415);
    await authLimit(req, "git-write", credential.userId, 30, 60);
    const output = await pushRepository(req, id, credential.userId, req.body);
    res.type("application/x-git-receive-pack-result").send(output);
  },
);
export default router;
