import type { Request, Response } from "express";
import { authOrigin } from "../lib/auth-config";
import { ApiError } from "../lib/errors";
import {
  authLimit,
  checkLock,
  clearFailures,
  failedAttempt,
} from "./auth-limits";
import { capabilities, providerClient, providerFailure } from "./auth-provider";
import {
  audit,
  createSession,
  requireAccount,
  requireFresh,
  requirePrimary,
  revokeSessions,
  transaction,
  SESSION_COOKIE,
  cookieOptions,
  type AuthSession,
} from "./auth-sessions";
import { createFlow, readFlow, consumeFlow } from "./auth-flows";
import {
  createOrganization,
  manageUser,
  organizationRole,
} from "./auth-account";
import { mfaAction } from "./auth-mfa";
import type { AuthInput, MfaInput } from "./auth-input";

export async function runAction(
  req: Request,
  res: Response,
  input: AuthInput,
  optional: AuthSession | null,
) {
  if (
    input.action.startsWith("mfa-") ||
    input.action === "recovery-codes" ||
    input.action === "recover-mfa"
  ) {
    return mfaAction(req, res, input as MfaInput, optional);
  }
  switch (input.action) {
    case "signup": {
      await authLimit(req, "signup", input.email, 3, 3600);
      const storage: Record<string, string> = {};
      const client = providerClient(storage);
      await audit(req, "auth.signup_requested");
      const result = await client.auth.signUp({
        email: input.email,
        password: input.password,
        options: {
          emailRedirectTo: `${authOrigin()}/api/auth/callback`,
          data: { display_name: input.displayName, kind: input.kind },
        },
      });
      providerFailure(result.error);
      if (result.data.session) {
        await createSession(req, res, result.data.session);
        return { message: "Account verified", signedIn: true };
      }
      const handle = await createFlow(req, res, {
        type: "signup",
        identifier: input.email,
        storage,
      });
      return {
        message:
          "If registration is available, check your email for the verification link or code. Open links in this browser",
        requiresVerification: true,
        handle,
      };
    }
    case "password-login": {
      await authLimit(req, "password-login", input.email, 10, 900);
      await checkLock(input.email);
      const result = await providerClient().auth.signInWithPassword({
        email: input.email,
        password: input.password,
      });
      if (result.error) {
        await failedAttempt(req, input.email);
        providerFailure(result.error);
      }
      if (!result.data.session)
        throw new ApiError(
          400,
          "AUTH_FAILED",
          "Check your credentials and verification status",
        );
      await createSession(req, res, result.data.session);
      await clearFailures(input.email);
      return { message: "Signed in", signedIn: true };
    }
    case "email-otp":
    case "phone-otp": {
      const identifier =
        input.action === "email-otp" ? input.email : input.phone;
      const ready = await capabilities();
      if (input.action === "phone-otp" && !ready.phoneOtp)
        throw new ApiError(
          503,
          "PHONE_OTP_SETUP_REQUIRED",
          "Phone OTP is pending MSG91 and Supabase SMS-hook setup",
        );
      await checkLock(identifier);
      await authLimit(req, "otp-resend", identifier, 1, 60);
      await authLimit(req, "otp-send", identifier, 3, 600);
      await audit(req, "auth.otp_requested", null, null, {
        channel: input.action === "email-otp" ? "email" : "sms",
      });
      const storage: Record<string, string> = {};
      const client = providerClient(storage);
      const data = {
        kind: input.kind || "developer",
        ...(input.displayName ? { display_name: input.displayName } : {}),
      };
      const result =
        input.action === "email-otp"
          ? await client.auth.signInWithOtp({
              email: input.email,
              options: {
                emailRedirectTo: `${authOrigin()}/api/auth/callback`,
                shouldCreateUser: true,
                data,
              },
            })
          : await client.auth.signInWithOtp({
              phone: input.phone,
              options: { shouldCreateUser: true, data },
            });
      providerFailure(result.error);
      const handle = await createFlow(req, res, {
        type: input.action === "email-otp" ? "email" : "sms",
        identifier,
        storage,
      });
      return {
        message:
          "Verification requested. Check your messages for the provider-issued code or email link",
        requiresVerification: true,
        handle,
      };
    }
    case "verify-otp": {
      const flow = await readFlow(req, input.handle);
      if (!flow.identifier || ["oauth", "recovery"].includes(flow.type))
        throw new ApiError(
          400,
          "INVALID_VERIFICATION",
          "Use the provider verification link for this request",
        );
      await checkLock(flow.identifier);
      await authLimit(req, "otp-verify", flow.identifier, 5, 900);
      if (flow.type === "phone_change") {
        const actor = requireAccount(optional);
        if (flow.userId !== actor.user.id)
          throw new ApiError(
            403,
            "VERIFICATION_INVALID",
            "This verification belongs to another account",
          );
      }
      const client = providerClient(flow.storage);
      const result =
        flow.type === "sms" || flow.type === "phone_change"
          ? await client.auth.verifyOtp({
              phone: flow.identifier,
              token: input.code,
              type: flow.type === "sms" ? "sms" : "phone_change",
            })
          : await client.auth.verifyOtp({
              email: flow.identifier,
              token: input.code,
              type: flow.type === "signup" ? "signup" : "email",
            });
      if (result.error) {
        await failedAttempt(req, flow.identifier);
        providerFailure(result.error);
      }
      if (!result.data.session)
        throw new ApiError(
          400,
          "AUTH_FAILED",
          "Verification is incomplete. Request a new code",
        );
      if (
        flow.type === "phone_change" &&
        (!optional ||
          flow.userId !== optional.user.id ||
          result.data.user?.id !== optional.providerUser.id)
      ) {
        throw new ApiError(
          403,
          "VERIFICATION_INVALID",
          "This verification does not belong to your signed-in account",
        );
      }
      await createSession(req, res, result.data.session);
      await consumeFlow(input.handle, res);
      await clearFailures(flow.identifier);
      return { message: "Verification complete", signedIn: true };
    }
    case "oauth": {
      const ready = await capabilities();
      if (!ready[input.provider])
        throw new ApiError(
          503,
          "OAUTH_SETUP_REQUIRED",
          "This social provider has not been configured",
        );
      await authLimit(req, "oauth", input.provider, 10, 600);
      const storage: Record<string, string> = {};
      const result = await providerClient(storage).auth.signInWithOAuth({
        provider: input.provider,
        options: {
          redirectTo: `${authOrigin()}/api/auth/callback`,
          skipBrowserRedirect: true,
        },
      });
      providerFailure(result.error);
      await createFlow(req, res, { type: "oauth", storage });
      await audit(req, "auth.oauth_started", null, null, {
        provider: input.provider,
      });
      return {
        message: "Continue with the identity provider",
        authorizationUrl: result.data.url!,
      };
    }
    case "password-reset": {
      await authLimit(req, "password-reset", input.email, 3, 3600);
      const storage: Record<string, string> = {};
      await audit(req, "auth.password_reset_requested");
      const result = await providerClient(storage).auth.resetPasswordForEmail(
        input.email,
        { redirectTo: `${authOrigin()}/api/auth/callback` },
      );
      providerFailure(result.error);
      await createFlow(req, res, {
        type: "recovery",
        identifier: input.email,
        storage,
      });
      return {
        message:
          "If this account can receive email, a reset link has been requested. Open it in this browser",
      };
    }
    case "update-password": {
      const session = requireAccount(optional);
      requireFresh(session, session.mfaRequired);
      const result = await session.client.auth.updateUser({
        password: input.password,
      });
      providerFailure(result.error);
      await audit(
        req,
        "auth.password_changed",
        session.user.id,
        session.user.id,
      );
      await revokeSessions(req, res, session, true);
      return {
        message: "Password changed. Sign in again on your devices",
        signedOut: true,
      };
    }
    case "logout": {
      const session = requirePrimary(optional);
      if (input.scope === "global") requireAccount(session);
      await revokeSessions(req, res, session, input.scope === "global");
      return {
        message:
          input.scope === "global" ? "Signed out on all devices" : "Signed out",
        signedOut: true,
      };
    }
    case "revoke-session": {
      const session = requireAccount(optional);
      await transaction(async (tx) => {
        const result = await tx.query(
          `UPDATE sessions SET revoked_at=now(),encrypted_credentials=NULL
          WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL RETURNING id`,
          [input.sessionId, session.user.id],
        );
        if (!result.rows[0])
          throw new ApiError(
            404,
            "SESSION_NOT_FOUND",
            "This session was not found",
          );
        await audit(
          req,
          "auth.device_revoked",
          session.user.id,
          input.sessionId,
          {},
          tx,
        );
      });
      if (input.sessionId === session.row.id) {
        res.clearCookie(SESSION_COOKIE, cookieOptions);
        return { message: "Current session revoked", signedOut: true };
      }
      return { message: "Device session revoked" };
    }
    case "update-profile": {
      const session = requireAccount(optional);
      await transaction(async (tx) => {
        await tx.query(
          "UPDATE profiles SET display_name=$2,kind=$3,updated_at=now() WHERE user_id=$1",
          [session.user.id, input.displayName, input.kind],
        );
        await audit(
          req,
          "account.profile_updated",
          session.user.id,
          session.user.id,
          { kind: input.kind },
          tx,
        );
      });
      return { message: "Profile updated" };
    }
    case "send-phone-verification": {
      const session = requireAccount(optional);
      requireFresh(session, session.mfaRequired);
      if (!(await capabilities()).phoneOtp)
        throw new ApiError(
          503,
          "PHONE_OTP_SETUP_REQUIRED",
          "Phone verification is pending SMS-provider setup",
        );
      await authLimit(req, "otp-resend", input.phone, 1, 60);
      await authLimit(req, "otp-send", input.phone, 3, 600);
      const result = await session.client.auth.updateUser({
        phone: input.phone,
      });
      providerFailure(result.error);
      const handle = await createFlow(req, res, {
        type: "phone_change",
        identifier: input.phone,
        storage: {},
        userId: session.user.id,
      });
      await audit(
        req,
        "auth.phone_verification_requested",
        session.user.id,
        session.user.id,
      );
      return {
        message: "Provider-issued phone verification requested",
        requiresVerification: true,
        handle,
      };
    }
    case "create-organization": {
      await createOrganization(
        req,
        requireAccount(optional),
        input.name,
        input.slug,
      );
      return { message: "Organization account created" };
    }
    case "organization-role": {
      await organizationRole(
        req,
        requireAccount(optional),
        input.organizationId,
        input.userId,
        input.role,
      );
      return { message: "Organization role updated" };
    }
    case "user-role": {
      await manageUser(req, requireAccount(optional), input.userId, {
        role: input.role,
      });
      return {
        message: "Platform role updated. The account must sign in again",
      };
    }
    case "user-status": {
      await manageUser(req, requireAccount(optional), input.userId, {
        status: input.status,
      });
      return { message: "Account status updated" };
    }
    default:
      throw new ApiError(
        400,
        "INVALID_ACTION",
        "Unsupported authentication action",
      );
  }
}

export async function authCallback(req: Request, res: Response) {
  try {
    const handle = req.cookies?.["__Host-ps-flow"];
    const flow = await readFlow(req, handle, true);
    const code = req.query.code;
    if (typeof code !== "string" || code.length > 2048)
      throw new Error("Missing authorization code");
    const result = await providerClient(
      flow.storage,
    ).auth.exchangeCodeForSession(code);
    providerFailure(result.error);
    if (!result.data.session)
      throw new Error("Provider session was not returned");
    if (flow.identifier) await checkLock(flow.identifier);
    await createSession(
      req,
      res,
      result.data.session,
      flow.type === "recovery",
    );
    await consumeFlow(handle, res);
    res.redirect(303, "/account");
  } catch {
    await audit(req, "auth.callback_failed");
    res.redirect(303, "/auth?error=callback_failed");
  }
}
