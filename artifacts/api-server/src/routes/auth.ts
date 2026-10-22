import { Router, type IRouter } from "express";
import {
  audit,
  csrfContext,
  factors,
  readSession,
  requireAccount,
  requireCsrf,
  transaction,
} from "../services/auth-sessions";
import { capabilities } from "../services/auth-provider";
import {
  authActionSchema,
  firebaseSessionSchema,
} from "../services/auth-input";
import { createFirebaseAppSession } from "../services/firebase-sessions";
import { runAction, authCallback } from "../services/auth-actions";
import { getAccount, listUsers } from "../services/auth-account";
import { authLimit } from "../services/auth-limits";
import { ApiError } from "../lib/errors";
import { cleanupAuthState } from "../services/auth-cleanup";
import { exportAccount } from "../services/account-data";
import { authOrigin, authenticationProvider } from "../lib/auth-config";

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
authRouter.get("/auth/firebase/config", async (_req, res) => {
  const provider = authenticationProvider();
  if (provider === "supabase") return res.json({ provider });
  const { getFirebasePublicConfig } =
    await import("../services/firebase-provider");
  return res.json({
    provider,
    firebase: getFirebasePublicConfig(),
    providers: {
      google: process.env.FIREBASE_GOOGLE_ENABLED === "true",
      github: process.env.FIREBASE_GITHUB_ENABLED === "true",
    },
  });
});
authRouter.post("/auth/firebase/session", async (req, res) => {
  requireCsrf(req);
  if (authenticationProvider() !== "firebase")
    throw new ApiError(
      409,
      "AUTH_METHOD_UNAVAILABLE",
      "This sign-in method is not available",
    );
  const parsed = firebaseSessionSchema.safeParse(req.body);
  if (!parsed.success)
    throw new ApiError(
      400,
      "INVALID_AUTH_INPUT",
      "The sign-in token is not valid",
    );
  await authLimit(req, "firebase-session", undefined, 10, 600);
  await createFirebaseAppSession(req, res, parsed.data.idToken);
  res.json({ signedIn: true });
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
    // Setup progress is for operators; the public response only says what works.
    capabilities: { ...available, pendingSetup: [] },
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
  await authLimit(req, "actions", session?.user.id, 60, 60);
  res.json(await runAction(req, res, parsed.data, session));
});
authRouter.get("/auth/account", async (req, res) => {
  res.json(await getAccount(requireAccount(await readSession(req, res))));
});
// A copy of the account's personal data (DPDP Act s.11).
authRouter.get("/auth/account/export", async (req, res) => {
  const session = requireAccount(await readSession(req, res), {
    allowPendingAgreement: true,
  });
  await authLimit(req, "account-export", session.user.id, 5, 3600);
  const data = await transaction((tx) => exportAccount(tx, session.user.id));
  await audit(req, "account.exported", session.user.id, session.user.id);
  res
    .set("Content-Disposition", 'attachment; filename="proofstack-data.json"')
    .json(data);
});
authRouter.get("/auth/admin/users", async (req, res) => {
  res.json(await listUsers(requireAccount(await readSession(req, res))));
});
authRouter.get("/auth/callback", authCallback);
export default authRouter;
