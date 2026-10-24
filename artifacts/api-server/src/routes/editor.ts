import { Router, type IRouter, type Response } from "express";
import {
  audit,
  cookieOptions,
  readSession,
  requireAccount,
  requireCsrf,
} from "../services/auth-sessions";
import { authLimit } from "../services/auth-limits";
import { authOrigin } from "../lib/auth-config";
import { safeEqual, signedNonce, validNonce } from "../lib/auth-crypto";
import {
  completeGithubConnection,
  disconnectGithub,
  githubAuthorizeUrl,
  githubConfig,
  githubConnection,
} from "../services/github";
import { storageEnabled } from "../services/repository-git";
import {
  commitChanges,
  createBranch,
  createPullRequest,
  forkRepository,
  listBranches,
  listPullRequests,
  listRepositories,
  listTree,
  openRepository,
  readFile,
} from "../services/editor";

const STATE_COOKIE = "__Host-ps-github-state";
// Where to send the member after GitHub answers: the editor or the wizard.
const RETURN_COOKIE = "__Host-ps-github-return";
const RETURNS = {
  code: "/code",
  welcome: "/welcome",
  settings: "/settings/connections",
} as const;
const callbackUrl = () => `${authOrigin()}/api/editor/github/callback`;
const router: IRouter = Router();

async function account(req: Parameters<typeof readSession>[0], res: Response) {
  const session = requireAccount(await readSession(req, res));
  await authLimit(req, "editor-read", session.user.id, 300, 60);
  return session;
}

router.get("/editor/sources", async (req, res) => {
  const session = await account(req, res);
  const github = await githubConnection(session.user.id);
  res.json({
    github: {
      available: !!githubConfig(),
      connected: !!github,
      login: github?.login ?? null,
    },
    hosted: { available: storageEnabled() },
  });
});
router.get("/editor/repositories", async (req, res) => {
  const session = await account(req, res);
  res.json(await listRepositories(session.user.id, req.query));
});
router.get("/editor/repository", async (req, res) => {
  const session = await account(req, res);
  res.json(await openRepository(session.user.id, req.query));
});
router.get("/editor/pull-requests", async (req, res) => {
  const session = await account(req, res);
  res.json(await listPullRequests(session.user.id, req.query));
});
router.get("/editor/branches", async (req, res) => {
  const session = await account(req, res);
  res.json(await listBranches(session.user.id, req.query));
});
router.get("/editor/tree", async (req, res) => {
  const session = await account(req, res);
  res.json(await listTree(session.user.id, req.query));
});
router.get("/editor/file", async (req, res) => {
  const session = await account(req, res);
  res.json(await readFile(session.user.id, req.query));
});
router.post("/editor/commit", async (req, res) => {
  requireCsrf(req);
  const session = requireAccount(await readSession(req, res));
  await authLimit(req, "editor-commit", session.user.id, 30, 600);
  const result = await commitChanges(req, session, req.body);
  await audit(req, "editor.commit", session.user.id);
  res.json(result);
});
router.post("/editor/branch", async (req, res) => {
  requireCsrf(req);
  const session = requireAccount(await readSession(req, res));
  await authLimit(req, "editor-branch", session.user.id, 30, 600);
  res.json(await createBranch(req, session, req.body));
});
router.post("/editor/fork", async (req, res) => {
  requireCsrf(req);
  const session = requireAccount(await readSession(req, res));
  await authLimit(req, "editor-fork", session.user.id, 5, 600);
  const result = await forkRepository(session.user.id, req.body);
  await audit(req, "editor.fork", session.user.id);
  res.json(result);
});
router.post("/editor/pull-request", async (req, res) => {
  requireCsrf(req);
  const session = requireAccount(await readSession(req, res));
  await authLimit(req, "editor-pull-request", session.user.id, 20, 600);
  const result = await createPullRequest(session.user.id, req.body);
  await audit(req, "editor.pull_request", session.user.id);
  res.json(result);
});

// Connecting GitHub: the browser is sent to GitHub with a one-time state that
// is also kept in an httpOnly cookie, and must match on the way back.
router.post("/editor/github/connect", async (req, res) => {
  requireCsrf(req);
  const session = requireAccount(await readSession(req, res));
  await authLimit(req, "github-connect", session.user.id, 10, 600);
  const state = signedNonce();
  const authorizeUrl = githubAuthorizeUrl(state, callbackUrl());
  const requested = req.body?.returnTo;
  const returnTo =
    typeof requested === "string" && requested in RETURNS
      ? (requested as keyof typeof RETURNS)
      : "code";
  res.cookie(STATE_COOKIE, state, { ...cookieOptions, maxAge: 600000 });
  res.cookie(RETURN_COOKIE, returnTo, { ...cookieOptions, maxAge: 600000 });
  res.json({ authorizeUrl });
});
router.post("/editor/github/disconnect", async (req, res) => {
  requireCsrf(req);
  const session = requireAccount(await readSession(req, res));
  await disconnectGithub(session.user.id);
  await audit(req, "editor.github_disconnected", session.user.id);
  res.json({ message: "GitHub disconnected" });
});
// Answers with a page that navigates on: the web tier's proxy follows HTTP
// redirects itself, which would lose this response's cookies.
function continueTo(
  res: Response,
  result: "connected" | "failed",
  returnTo: unknown,
) {
  res.clearCookie(STATE_COOKIE, cookieOptions);
  res.clearCookie(RETURN_COOKIE, cookieOptions);
  const base =
    typeof returnTo === "string" && returnTo in RETURNS
      ? RETURNS[returnTo as keyof typeof RETURNS]
      : RETURNS.code;
  const path = `${base}?github=${result}`;
  res
    .status(200)
    .set("Referrer-Policy", "no-referrer")
    .type("html")
    .send(
      `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${path}"><title>GitHub</title><a href="${path}">Continue</a>`,
    );
}
router.get("/editor/github/callback", async (req, res) => {
  const returnTo = req.cookies?.[RETURN_COOKIE];
  try {
    const session = requireAccount(await readSession(req, res));
    const state = req.cookies?.[STATE_COOKIE];
    const returned = req.query.state;
    const code = req.query.code;
    if (
      !validNonce(state) ||
      typeof returned !== "string" ||
      !safeEqual(state, returned) ||
      typeof code !== "string" ||
      code.length > 200
    )
      throw new Error("GitHub state mismatch");
    await completeGithubConnection(session.user.id, code, callbackUrl());
    await audit(req, "editor.github_connected", session.user.id);
    continueTo(res, "connected", returnTo);
  } catch {
    continueTo(res, "failed", returnTo);
  }
});

export default router;
