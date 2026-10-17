import type { Request, Response } from "express";
import { pool } from "@workspace/db";
import {
  digest,
  opaqueHandle,
  seal,
  signedNonce,
  validNonce,
  unseal,
} from "../lib/auth-crypto";
import {
  createFirebaseProvider,
  type FirebasePrincipal,
  type FirebaseCredentials,
} from "./firebase-provider";
import { ApiError } from "../lib/errors";
import {
  audit,
  cookieOptions,
  DEVICE_COOKIE,
  SESSION_COOKIE,
  transaction,
  upsertProviderUser,
  type ProviderIdentity,
  type AccountUser,
  type SessionRow,
} from "./auth-sessions";

export type FirebaseAppSession = {
  provider: "firebase";
  row: SessionRow;
  user: AccountUser;
  providerUser: ProviderIdentity;
  client: null;
  credentials: FirebaseCredentials;
  aal: string;
  mfaRequired: boolean;
  privileged: boolean;
  firebase: { uid: string; projectId: string };
};

const LIFETIME_MS = 7 * 86400000;

// Contact and assurance data come only from Firebase's verified current identity,
// never from client metadata or custom role claims.
function identity(principal: FirebasePrincipal): ProviderIdentity {
  const verifiedAt = new Date().toISOString();
  return {
    id: principal.subject,
    email: principal.email ?? undefined,
    phone: principal.phoneNumber ?? undefined,
    email_confirmed_at: principal.email ? verifiedAt : undefined,
    phone_confirmed_at: principal.phoneNumber ? verifiedAt : undefined,
    user_metadata: { display_name: principal.displayName },
    factors: principal.nativeFactors
      .filter(
        (factor) => factor.factorId === "totp" || factor.factorId === "phone",
      )
      .map((factor) => ({
        id: factor.uid,
        factor_type: factor.factorId as "totp" | "phone",
        status: "verified" as const,
        friendly_name: factor.displayName ?? "Security factor",
      })),
  };
}
function deviceLabel(req: Request) {
  const ua = req.get("user-agent") || "";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Firefox\//.test(ua)
      ? "Firefox"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Browser";
  const os = /Android/.test(ua)
    ? "Android"
    : /iPhone|iPad/.test(ua)
      ? "iOS"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "device";
  return `${browser} on ${os}`;
}

export async function createFirebaseAppSession(
  req: Request,
  res: Response,
  idToken: string,
): Promise<void> {
  if (process.env.AUTH_PROVIDER !== "firebase")
    throw new ApiError(
      409,
      "AUTH_METHOD_UNAVAILABLE",
      "Firebase authentication is not selected",
    );
  const provider = createFirebaseProvider();
  await provider.verifyIdToken(idToken);
  const issued = await provider.createSessionCookie(idToken, LIFETIME_MS);
  const handle = opaqueHandle();
  const device = validNonce(req.cookies?.[DEVICE_COOKIE])
    ? req.cookies[DEVICE_COOKIE]
    : signedNonce();
  await transaction(async (tx) => {
    const user = await upsertProviderUser(identity(issued.principal), tx);
    const known = await tx.query(
      "SELECT device_hash FROM sessions WHERE user_id=$1 LIMIT 100",
      [user.id],
    );
    const deviceHash = digest(device, "device");
    const suspicious =
      known.rows.length > 0 &&
      !known.rows.some((row) => row.device_hash === deviceHash);
    await tx.query(
      `INSERT INTO sessions(user_id,provider_session_id,handle_hash,encrypted_credentials,device_hash,device_label,expires_at,password_recovery,created_at,last_mfa_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,false,$8,$9)`,
      [
        user.id,
        `firebase:${digest(idToken, "firebase-login")}`,
        digest(handle),
        seal(issued.credentials),
        deviceHash,
        deviceLabel(req),
        new Date(issued.principal.authTime * 1000 + LIFETIME_MS),
        new Date(issued.principal.authTime * 1000),
        issued.principal.assurance === "aal2"
          ? new Date(issued.principal.authTime * 1000)
          : null,
      ],
    );
    await audit(
      req,
      "auth.login_succeeded",
      user.id,
      user.id,
      { newDevice: suspicious },
      tx,
    );
    if (suspicious) {
      await audit(
        req,
        "auth.suspicious_login",
        user.id,
        user.id,
        { reason: "new_device" },
        tx,
      );
      await tx.query(
        "INSERT INTO notifications(user_id,title,body) VALUES($1,$2,$3)",
        [
          user.id,
          "New device signed in",
          `${deviceLabel(req)} signed in. Review your active sessions if this was not you.`,
        ],
      );
    }
  }).catch((error) => {
    if (
      error?.code === "23505" &&
      error.constraint === "sessions_provider_session_id_unique"
    ) {
      throw new ApiError(
        409,
        "SIGN_IN_REPLAY",
        "Sign in again with a fresh identity token",
      );
    }
    if (
      error?.code === "23505" &&
      /^users_(email|phone)_unique$/.test(error.constraint ?? "")
    ) {
      throw new ApiError(
        409,
        "AUTH_IDENTITY_LINK_REQUIRED",
        "This verified contact requires explicit account linking",
      );
    }
    throw error;
  });
  res.cookie(DEVICE_COOKIE, device, {
    ...cookieOptions,
    maxAge: 365 * 86400000,
  });
  res.cookie(SESSION_COOKIE, handle, { ...cookieOptions, maxAge: LIFETIME_MS });
}

function unusable(row: SessionRow): boolean {
  return (
    !!row.revoked_at ||
    !row.encrypted_credentials ||
    new Date(row.expires_at).getTime() <= Date.now() ||
    Date.now() - new Date(row.last_seen_at).getTime() > 30 * 60000
  );
}
async function invalidate(row: SessionRow) {
  // Do not destroy credentials another request replaced while native I/O was pending.
  await pool.query(
    `UPDATE sessions SET revoked_at=COALESCE(revoked_at,now()),encrypted_credentials=NULL
    WHERE id=$1 AND encrypted_credentials IS NOT DISTINCT FROM $2`,
    [row.id, row.encrypted_credentials],
  );
}
function clear(res: Response) {
  res.clearCookie(SESSION_COOKIE, cookieOptions);
  return null;
}

export async function readFirebaseAppSession(
  req: Request,
  res: Response,
): Promise<FirebaseAppSession | null> {
  delete res.locals.principal;
  if (process.env.AUTH_PROVIDER !== "firebase") return clear(res);
  const handle = req.cookies?.[SESSION_COOKIE];
  if (typeof handle !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(handle))
    return null;
  const initial = (
    await pool.query<SessionRow>(
      "SELECT * FROM sessions WHERE handle_hash=$1",
      [digest(handle)],
    )
  ).rows[0];
  if (!initial || !/^firebase:[a-f0-9]{64}$/.test(initial.provider_session_id))
    return clear(res);
  const device = req.cookies?.[DEVICE_COOKIE];
  // A stolen handle cannot resume or revoke the legitimate browser session.
  if (!validNonce(device) || digest(device, "device") !== initial.device_hash)
    return clear(res);
  if (unusable(initial)) {
    await invalidate(initial);
    return clear(res);
  }
  let credentials: FirebaseCredentials;
  try {
    const stored = unseal<unknown>(initial.encrypted_credentials);
    if (
      !stored ||
      typeof stored !== "object" ||
      !("provider" in stored) ||
      stored.provider !== "firebase" ||
      !("sessionCookie" in stored) ||
      typeof stored.sessionCookie !== "string" ||
      !stored.sessionCookie ||
      Object.keys(stored).some(
        (key) => !["provider", "sessionCookie"].includes(key),
      )
    )
      throw new Error("Invalid session credentials");
    credentials = stored as FirebaseCredentials;
  } catch (error) {
    if (error instanceof ApiError && error.status === 503) throw error;
    await invalidate(initial);
    return clear(res);
  }
  let checked: Awaited<
    ReturnType<ReturnType<typeof createFirebaseProvider>["verifySessionCookie"]>
  >;
  try {
    checked = await createFirebaseProvider().verifySessionCookie(credentials);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    await invalidate(initial);
    return clear(res);
  }
  const providerUser = identity(checked.principal);
  const session = await transaction(async (tx) => {
    const row = (
      await tx.query<SessionRow>(
        "SELECT * FROM sessions WHERE id=$1 AND handle_hash=$2 FOR UPDATE",
        [initial.id, digest(handle)],
      )
    ).rows[0];
    if (!row || row.encrypted_credentials !== initial.encrypted_credentials)
      return null;
    if (unusable(row)) {
      await tx.query(
        "UPDATE sessions SET revoked_at=COALESCE(revoked_at,now()),encrypted_credentials=NULL WHERE id=$1",
        [row.id],
      );
      return null;
    }
    const boundUser = (
      await tx.query("SELECT id FROM users WHERE auth_subject=$1", [
        providerUser.id,
      ])
    ).rows[0];
    if (
      boundUser?.id !== row.user_id ||
      checked.principal.authTime * 1000 !== new Date(row.created_at).getTime()
    ) {
      await tx.query(
        "UPDATE sessions SET revoked_at=COALESCE(revoked_at,now()),encrypted_credentials=NULL WHERE id=$1",
        [row.id],
      );
      return null;
    }
    const user = await upsertProviderUser(providerUser, tx);
    const membership = await tx.query(
      `SELECT 1 FROM organization_members m JOIN roles r ON r.id=m.role_id
      WHERE m.user_id=$1 AND m.status='active' AND r.key IN ('organization_owner','organization_admin') LIMIT 1`,
      [user.id],
    );
    const privileged = !!user.platformRole || membership.rows.length > 0;
    const updated = await tx.query<SessionRow>(
      "UPDATE sessions SET last_seen_at=now() WHERE id=$1 RETURNING *",
      [row.id],
    );
    return {
      provider: "firebase" as const,
      row: updated.rows[0],
      user,
      providerUser,
      client: null,
      credentials,
      aal: checked.principal.assurance,
      mfaRequired:
        privileged ||
        user.mfaRecoveryRequired ||
        !!providerUser.factors?.some((factor) => factor.status === "verified"),
      privileged,
      firebase: {
        uid: checked.principal.uid,
        projectId: checked.principal.projectId,
      },
    };
  });
  if (!session) return clear(res);
  if (
    !session.user.mfaRecoveryRequired &&
    (!session.mfaRequired ||
      (session.aal === "aal2" &&
        session.providerUser.factors?.some(
          (factor) => factor.status === "verified",
        )))
  ) {
    res.locals.principal = {
      userId: session.user.id,
      authSubject: session.providerUser.id,
    };
  }
  return session;
}
