import { pool } from "@workspace/db";
import type { PoolClient } from "pg";
import type { Request, Response } from "express";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import {
  digest,
  opaqueHandle,
  seal,
  unseal,
  signedNonce,
  validNonce,
} from "../lib/auth-crypto";
import { authOrigin } from "../lib/auth-config";
import { env } from "../lib/env";
import { ApiError } from "../lib/errors";
import {
  adminClient,
  providerClient,
  providerFailure,
  sessionClient,
  verifiedClaims,
  type Credentials,
} from "./auth-provider";
import { writeAuditEvent } from "./audit";

export const SESSION_COOKIE = "__Host-ps-session";
export const CSRF_COOKIE = "__Host-ps-csrf";
export const FLOW_COOKIE = "__Host-ps-flow";
export const DEVICE_COOKIE = "__Host-ps-device";
export const cookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite:
    env.NODE_ENV === "production" ? ("lax" as const) : ("none" as const),
  path: "/",
};
export const flowCookieOptions = { ...cookieOptions, maxAge: 20 * 60 * 1000 };
export type AccountUser = {
  id: string;
  displayName: string;
  kind: "developer" | "company" | "recruiter";
  email: string | null;
  phone: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
  platformRole: "moderator" | "admin" | "super_admin" | null;
  status: "active" | "disabled";
  mfaRecoveryRequired: boolean;
};
export type SessionRow = {
  id: string;
  user_id: string;
  provider_session_id: string;
  encrypted_credentials: string;
  device_hash: string;
  device_label: string;
  created_at: Date;
  last_seen_at: Date;
  expires_at: Date;
  revoked_at: Date | null;
  last_mfa_at: Date | null;
  password_recovery: boolean;
};
export type AuthSession = {
  row: SessionRow;
  user: AccountUser;
  providerUser: User;
  client: SupabaseClient;
  credentials: Credentials;
  aal: string;
  mfaRequired: boolean;
  privileged: boolean;
};

export async function transaction<T>(
  fn: (tx: PoolClient) => Promise<T>,
): Promise<T> {
  const tx = await pool.connect();
  try {
    await tx.query("BEGIN");
    const result = await fn(tx);
    await tx.query("COMMIT");
    return result;
  } catch (error) {
    await tx.query("ROLLBACK");
    throw error;
  } finally {
    tx.release();
  }
}
export function audit(
  req: Request,
  action: string,
  actorUserId: string | null = null,
  resourceId: string | null = null,
  metadata: Record<string, string | boolean | number | null> = {},
  tx?: PoolClient,
) {
  return writeAuditEvent(
    {
      action,
      actorUserId,
      resourceId,
      resourceType: "account",
      requestId: String(req.id),
      metadata,
    },
    tx ? (text, values) => tx.query(text, values) : undefined,
  );
}
export function csrfContext(req: Request, res: Response) {
  let value: string = req.cookies?.[CSRF_COOKIE];
  if (!validNonce(value)) {
    value = signedNonce();
    res.cookie(CSRF_COOKIE, value, { ...cookieOptions, maxAge: 86400000 });
  }
  if (!validNonce(req.cookies?.[DEVICE_COOKIE])) {
    res.cookie(DEVICE_COOKIE, signedNonce(), {
      ...cookieOptions,
      maxAge: 365 * 86400000,
    });
  }
  return value;
}
export function requireCsrf(req: Request) {
  const origin = req.get("origin");
  const token = req.get("X-CSRF-Token") || "";
  if (
    origin !== authOrigin() ||
    !validNonce(req.cookies?.[CSRF_COOKIE]) ||
    token !== req.cookies[CSRF_COOKIE]
  ) {
    throw new ApiError(
      403,
      "CSRF_REJECTED",
      "Reload this page before trying again",
    );
  }
}
export function factors(user: User) {
  return (user.factors || [])
    .filter((f) => f.factor_type === "totp" || f.factor_type === "phone")
    .map((f) => ({
      id: f.id,
      type: f.factor_type as "totp" | "phone",
      status: f.status,
      name: f.friendly_name || "Security factor",
    }));
}
export function requireAccount(session: AuthSession | null): AuthSession {
  if (!session)
    throw new ApiError(401, "SIGN_IN_REQUIRED", "Sign in to continue");
  if (
    session.user.mfaRecoveryRequired ||
    (session.mfaRequired &&
      (session.aal !== "aal2" ||
        !factors(session.providerUser).some((f) => f.status === "verified")))
  )
    throw new ApiError(
      403,
      "MFA_REQUIRED",
      "Verify a security factor before continuing",
    );
  return session;
}
export function requirePrimary(session: AuthSession | null): AuthSession {
  if (!session)
    throw new ApiError(401, "SIGN_IN_REQUIRED", "Sign in to continue");
  return session;
}
export function requireFresh(session: AuthSession, mfa = false) {
  if (
    mfa &&
    (session.aal !== "aal2" ||
      !factors(session.providerUser).some((f) => f.status === "verified"))
  )
    throw new ApiError(
      403,
      "MFA_REQUIRED",
      "Verify a security factor before continuing",
    );
  const date = mfa ? session.row.last_mfa_at : session.row.created_at;
  if (!date || Date.now() - new Date(date).getTime() > 5 * 60000) {
    throw new ApiError(
      403,
      mfa ? "MFA_STEP_UP_REQUIRED" : "REAUTHENTICATION_REQUIRED",
      mfa
        ? "Verify your security factor again for this sensitive action"
        : "Sign in again before changing security settings",
    );
  }
}
export async function upsertProviderUser(
  user: User,
  tx: PoolClient,
): Promise<AccountUser> {
  if (!user.email_confirmed_at && !user.phone_confirmed_at) {
    throw new ApiError(
      403,
      "IDENTITY_VERIFICATION_REQUIRED",
      "Verify your email or phone before signing in",
    );
  }
  const { rows } = await tx.query(
    `INSERT INTO users(auth_subject,email,phone,email_verified_at,phone_verified_at)
    VALUES($1,$2,$3,$4,$5) ON CONFLICT(auth_subject) DO UPDATE SET email=EXCLUDED.email,phone=EXCLUDED.phone,
    email_verified_at=EXCLUDED.email_verified_at,phone_verified_at=EXCLUDED.phone_verified_at,updated_at=now() RETURNING id,status`,
    [
      user.id,
      user.email_confirmed_at ? user.email?.toLowerCase() || null : null,
      user.phone_confirmed_at
        ? `+${(user.phone || "").replace(/^\+/, "")}`
        : null,
      user.email_confirmed_at || null,
      user.phone_confirmed_at || null,
    ],
  );
  if (rows[0].status !== "active")
    throw new ApiError(403, "ACCOUNT_DISABLED", "This account is unavailable");
  const metadata = user.user_metadata || {};
  const kind = ["developer", "company", "recruiter"].includes(metadata.kind)
    ? metadata.kind
    : "developer";
  const name =
    typeof metadata.display_name === "string"
      ? metadata.display_name
      : typeof metadata.full_name === "string"
        ? metadata.full_name
        : "Verified account";
  await tx.query(
    `INSERT INTO profiles(user_id,display_name,kind) VALUES($1,$2,$3)
    ON CONFLICT(user_id) DO NOTHING`,
    [rows[0].id, name.trim().slice(0, 160) || "Verified account", kind],
  );
  const result = await tx.query(
    `SELECT u.id,u.email,u.phone,u.platform_role AS "platformRole",u.status,
    u.email_verified_at IS NOT NULL AS "emailVerified",u.phone_verified_at IS NOT NULL AS "phoneVerified",
    u.mfa_recovery_required AS "mfaRecoveryRequired",p.display_name AS "displayName",p.kind
    FROM users u JOIN profiles p ON p.user_id=u.id WHERE u.id=$1`,
    [rows[0].id],
  );
  return result.rows[0] as AccountUser;
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
export async function createSession(
  req: Request,
  res: Response,
  credentials: Credentials,
  recovery = false,
) {
  const checked = await providerClient().auth.getUser(credentials.access_token);
  providerFailure(checked.error);
  if (!checked.data.user)
    throw new ApiError(
      401,
      "SESSION_INVALID",
      "The provider identity could not be verified",
    );
  const providerUser = checked.data.user;
  const claims = verifiedClaims(credentials.access_token, providerUser);
  const handle = opaqueHandle();
  const device = validNonce(req.cookies?.[DEVICE_COOKIE])
    ? req.cookies[DEVICE_COOKIE]
    : signedNonce();
  res.cookie(DEVICE_COOKIE, device, {
    ...cookieOptions,
    maxAge: 365 * 86400000,
  });
  await transaction(async (tx) => {
    const user = await upsertProviderUser(providerUser, tx);
    const known = await tx.query(
      "SELECT device_hash FROM sessions WHERE user_id=$1 LIMIT 100",
      [user.id],
    );
    const deviceHash = digest(device, "device");
    const suspicious =
      known.rows.length > 0 &&
      !known.rows.some((r) => r.device_hash === deviceHash);
    // Reissued handles invalidate the old handle for this same provider session.
    await tx.query(
      `INSERT INTO sessions(user_id,provider_session_id,handle_hash,encrypted_credentials,device_hash,device_label,expires_at,password_recovery)
      VALUES($1,$2,$3,$4,$5,$6,now()+$7*interval '1 second',$8)
      ON CONFLICT(provider_session_id) DO UPDATE SET handle_hash=EXCLUDED.handle_hash,encrypted_credentials=EXCLUDED.encrypted_credentials,
      revoked_at=NULL,expires_at=LEAST(sessions.expires_at,EXCLUDED.expires_at),last_seen_at=now()`,
      [
        user.id,
        claims.session_id,
        digest(handle),
        seal(credentials),
        deviceHash,
        deviceLabel(req),
        recovery ? 600 : 7 * 86400,
        recovery,
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
  });
  res.cookie(SESSION_COOKIE, handle, {
    ...cookieOptions,
    maxAge: recovery ? 600000 : 7 * 86400000,
  });
}
export async function readSession(
  req: Request,
  res: Response,
): Promise<AuthSession | null> {
  const handle: unknown = req.cookies?.[SESSION_COOKIE];
  if (typeof handle !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(handle))
    return null;
  const result = await transaction(async (tx) => {
    const { rows } = await tx.query<SessionRow>(
      "SELECT * FROM sessions WHERE handle_hash=$1 FOR UPDATE",
      [digest(handle)],
    );
    const row = rows[0];
    if (
      !row ||
      row.revoked_at ||
      !row.encrypted_credentials ||
      new Date(row.expires_at).getTime() <= Date.now() ||
      Date.now() - new Date(row.last_seen_at).getTime() > 30 * 60000
    ) {
      if (row)
        await tx.query(
          "UPDATE sessions SET revoked_at=COALESCE(revoked_at,now()),encrypted_credentials=NULL WHERE id=$1",
          [row.id],
        );
      return null;
    }
    const stored = unseal<Credentials>(row.encrypted_credentials);
    let hydrated: Awaited<ReturnType<typeof sessionClient>>;
    try {
      hydrated = await sessionClient(stored);
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
      await tx.query(
        "UPDATE sessions SET revoked_at=now(),encrypted_credentials=NULL WHERE id=$1",
        [row.id],
      );
      return null;
    }
    const checked = await hydrated.client.auth.getUser(
      hydrated.credentials.access_token,
    );
    if (
      checked.error?.status === 401 ||
      checked.error?.status === 403 ||
      (!checked.data.user && !checked.error)
    )
      return null;
    providerFailure(checked.error);
    const providerUser = checked.data.user!;
    const claims = verifiedClaims(
      hydrated.credentials.access_token,
      providerUser,
    );
    if (claims.session_id !== row.provider_session_id)
      throw new ApiError(
        401,
        "SESSION_INVALID",
        "The provider session is invalid",
      );
    const user = await upsertProviderUser(providerUser, tx);
    if (user.id !== row.user_id)
      throw new ApiError(
        401,
        "SESSION_INVALID",
        "The account session is invalid",
      );
    if (stored.refresh_token !== hydrated.credentials.refresh_token) {
      await tx.query(
        "UPDATE sessions SET encrypted_credentials=$2 WHERE id=$1",
        [row.id, seal(hydrated.credentials)],
      );
    }
    await tx.query("UPDATE sessions SET last_seen_at=now() WHERE id=$1", [
      row.id,
    ]);
    const membership = await tx.query(
      `SELECT 1 FROM organization_members m JOIN roles r ON r.id=m.role_id
       WHERE m.user_id=$1 AND m.status='active'
       AND r.key IN ('organization_owner','organization_admin') LIMIT 1`,
      [user.id],
    );
    const privileged = !!user.platformRole || membership.rows.length > 0;
    const required =
      privileged ||
      user.mfaRecoveryRequired ||
      factors(providerUser).some((f) => f.status === "verified");
    return {
      row,
      user,
      providerUser,
      ...hydrated,
      aal: claims.aal,
      mfaRequired: required,
      privileged,
    };
  });
  if (!result) res.clearCookie(SESSION_COOKIE, cookieOptions);
  else if (
    !result.user.mfaRecoveryRequired &&
    (!result.mfaRequired ||
      (result.aal === "aal2" &&
        factors(result.providerUser).some((f) => f.status === "verified")))
  )
    res.locals.principal = {
      userId: result.user.id,
      authSubject: result.providerUser.id,
    };
  return result;
}
export async function saveCredentials(
  session: AuthSession,
  credentials: Credentials,
  mfa = false,
) {
  const checked = await providerClient().auth.getUser(credentials.access_token);
  providerFailure(checked.error);
  if (!checked.data.user || checked.data.user.id !== session.providerUser.id)
    throw new ApiError(
      401,
      "SESSION_INVALID",
      "The provider identity is invalid",
    );
  const claims = verifiedClaims(credentials.access_token, checked.data.user);
  if (
    claims.session_id !== session.row.provider_session_id ||
    (mfa && claims.aal !== "aal2")
  ) {
    throw new ApiError(
      401,
      "SESSION_INVALID",
      "The provider assurance could not be verified",
    );
  }
  const updated = await pool.query(
    `UPDATE sessions SET encrypted_credentials=$2,last_mfa_at=CASE WHEN $3 THEN now() ELSE last_mfa_at END
    WHERE id=$1 AND revoked_at IS NULL AND expires_at>now()`,
    [session.row.id, seal(credentials), mfa],
  );
  if (!updated.rowCount)
    throw new ApiError(
      401,
      "SESSION_REVOKED",
      "This session has been revoked. Sign in again",
    );
}
export async function revokeSessions(
  req: Request,
  res: Response,
  session: AuthSession,
  global: boolean,
) {
  await transaction(async (tx) => {
    await tx.query(
      `UPDATE sessions SET revoked_at=now(),encrypted_credentials=NULL WHERE user_id=$1 ${global ? "" : "AND id=$2"}`,
      global ? [session.user.id] : [session.user.id, session.row.id],
    );
    await audit(
      req,
      global ? "auth.logout_all" : "auth.logout",
      session.user.id,
      session.user.id,
      {},
      tx,
    );
  });
  // Local revocation is immediate; native revocation failure is explicit.
  const result = await adminClient().auth.admin.signOut(
    session.credentials.access_token,
    global ? "global" : "local",
  );
  res.clearCookie(SESSION_COOKIE, cookieOptions);
  if (
    result.error &&
    result.error.status !== 401 &&
    result.error.status !== 404
  )
    providerFailure(result.error);
}
