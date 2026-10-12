import { Router, type IRouter } from "express";
import {
  csrfContext,
  factors,
  readSession,
  requireAccount,
  requireCsrf,
} from "../services/auth-sessions";
import { capabilities } from "../services/auth-provider";
import { authActionSchema } from "../services/auth-input";
import { runAction, authCallback } from "../services/auth-actions";
import { getAccount, listUsers } from "../services/auth-account";
import { authLimit } from "../services/auth-limits";
import { ApiError } from "../lib/errors";
import { cleanupAuthState } from "../services/auth-cleanup";
import { authOrigin } from "../lib/auth-config";

const authRouter: IRouter = Router();
authRouter.use("/auth", (req, res, next) => {
  res.set("Cache-Control", "private, no-store");
  if (req.get("origin") && req.get("origin") !== authOrigin()) {
    throw new ApiError(
      403,
      "ORIGIN_DENIED",
      "Authentication is restricted to the application origin",
    );
  }
  next();
});
authRouter.get("/auth/context", async (req, res) => {
  const csrfToken = csrfContext(req, res);
  await cleanupAuthState();
  const [session, available] = await Promise.all([
    readSession(req, res),
    capabilities(),
  ]);
  res.json({
    csrfToken,
    authenticated: !!session,
    user: session?.user || null,
    mfaRequired:
      !!session &&
      (session.user.mfaRecoveryRequired ||
        (session.mfaRequired &&
          (session.aal !== "aal2" ||
            !factors(session.providerUser).some(
              (f) => f.status === "verified",
            )))),
    factors: session ? factors(session.providerUser) : [],
    capabilities: available,
  });
});
authRouter.post("/auth/action", async (req, res) => {
  requireCsrf(req);
  const parsed = authActionSchema.safeParse(req.body);
  if (!parsed.success)
    throw new ApiError(
      400,
      "INVALID_AUTH_INPUT",
      parsed.error.issues[0]?.message || "Invalid authentication input",
    );
  const session = await readSession(req, res);
  await authLimit(req, "actions", session?.user.id || "anonymous", 60, 60);
  res.json(await runAction(req, res, parsed.data, session));
});
authRouter.get("/auth/account", async (req, res) => {
  res.json(await getAccount(requireAccount(await readSession(req, res))));
});
authRouter.get("/auth/admin/users", async (req, res) => {
  res.json(await listUsers(requireAccount(await readSession(req, res))));
});
authRouter.get("/auth/callback", authCallback);
export default authRouter;
