import { randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import { digest } from "../lib/auth-crypto";
import { ApiError } from "../lib/errors";
import { adminClient, capabilities, providerFailure } from "./auth-provider";
import { authLimit } from "./auth-limits";
import {
  audit,
  factors,
  requireFresh,
  requirePrimary,
  requireSupabase,
  requireAccount,
  revokeSessions,
  saveCredentials,
  transaction,
  type AuthSession,
} from "./auth-sessions";
import type { MfaInput } from "./auth-input";

export async function mfaAction(
  req: Request,
  res: Response,
  input: MfaInput,
  optional: AuthSession | null,
) {
  const session = requireSupabase(requirePrimary(optional));
  await authLimit(req, "mfa", session.user.id, 10, 600);
  const existing = factors(session.providerUser);
  if (input.action === "mfa-enroll") {
    if (existing.some((f) => f.status === "verified"))
      requireFresh(requireAccount(session), true);
    else requireFresh(session);
    if (input.factorType === "phone") {
      if (!(await capabilities()).phoneMfa)
        throw new ApiError(
          503,
          "PHONE_MFA_SETUP_REQUIRED",
          "Phone MFA requires verified SMS configuration and provider-plan support",
        );
      if (!input.phone)
        throw new ApiError(
          400,
          "PHONE_REQUIRED",
          "Enter the phone number for this factor",
        );
      const result = await session.client.auth.mfa.enroll({
        factorType: "phone",
        phone: input.phone,
      });
      providerFailure(result.error);
      await audit(
        req,
        "auth.mfa_enrollment_started",
        session.user.id,
        session.user.id,
        { method: "phone" },
      );
      return {
        message: "Request a code to verify this phone factor",
        factor: { id: result.data!.id, type: "phone" as const },
      };
    }
    const result = await session.client.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `Authenticator ${randomBytes(4).toString("hex")}`,
    });
    providerFailure(result.error);
    if (!result.data || result.data.type !== "totp")
      throw new ApiError(
        503,
        "MFA_UNAVAILABLE",
        "Authenticator enrollment failed",
      );
    await audit(
      req,
      "auth.mfa_enrollment_started",
      session.user.id,
      session.user.id,
      { method: "totp" },
    );
    return {
      message: "Scan with your authenticator app, then enter its code",
      factor: {
        id: result.data.id,
        type: "totp" as const,
        qrCode: result.data.totp.qr_code,
        secret: result.data.totp.secret,
      },
    };
  }
  if (
    input.action === "mfa-challenge" ||
    input.action === "mfa-verify" ||
    input.action === "mfa-remove"
  ) {
    const factor = existing.find((f) => f.id === input.factorId);
    if (!factor)
      throw new ApiError(
        404,
        "FACTOR_NOT_FOUND",
        "This factor is not available for your account",
      );
    if (input.action === "mfa-challenge") {
      const result = await session.client.auth.mfa.challenge({
        factorId: factor.id,
      });
      providerFailure(result.error);
      return {
        message:
          factor.type === "phone"
            ? "Provider-issued code requested"
            : "Authenticator challenge created",
        challengeId: result.data!.id,
      };
    }
    if (input.action === "mfa-verify") {
      if (session.user.mfaRecoveryRequired && factor.status === "verified") {
        throw new ApiError(
          403,
          "RECOVERY_PENDING",
          "Complete recovery before enrolling and verifying a new factor",
        );
      }
      const result = input.challengeId
        ? await session.client.auth.mfa.verify({
            factorId: factor.id,
            challengeId: input.challengeId,
            code: input.code,
          })
        : factor.type === "totp"
          ? await session.client.auth.mfa.challengeAndVerify({
              factorId: factor.id,
              code: input.code,
            })
          : null;
      if (!result)
        throw new ApiError(
          400,
          "CHALLENGE_REQUIRED",
          "Request a new phone-factor code before verifying",
        );
      if (result.error) {
        await audit(req, "auth.mfa_verification_failed", session.user.id);
        providerFailure(result.error);
      }
      await saveCredentials(session, result.data!, true);
      await transaction(async (tx) => {
        await tx.query(
          "UPDATE users SET mfa_recovery_required=false WHERE id=$1",
          [session.user.id],
        );
        await audit(
          req,
          "auth.mfa_verified",
          session.user.id,
          session.user.id,
          { method: factor.type },
          tx,
        );
      });
      return { message: "Security factor verified", signedIn: true };
    }
    // Cancelling an unverified first enrollment is not a downgrade of MFA.
    // Existing verified factors still require fresh native AAL2.
    if (
      factor.status === "unverified" &&
      !existing.some((f) => f.status === "verified")
    )
      requireFresh(session);
    else requireFresh(requireAccount(session), true);
    if (
      session.privileged &&
      factor.status === "verified" &&
      existing.filter((f) => f.status === "verified").length <= 1
    ) {
      throw new ApiError(
        409,
        "PRIVILEGED_MFA_REQUIRED",
        "Privileged accounts must keep a verified security factor",
      );
    }
    const result = await session.client.auth.mfa.unenroll({
      factorId: factor.id,
    });
    providerFailure(result.error);
    await audit(req, "auth.mfa_removed", session.user.id, session.user.id, {
      method: factor.type,
    });
    if (factor.status === "unverified")
      return { message: "Unverified enrollment cancelled" };
    await revokeSessions(req, res, session, true);
    return { message: "Factor removed. Sign in again", signedOut: true };
  }
  if (input.action === "recovery-codes") {
    requireFresh(requireAccount(session), true);
    if (!existing.some((f) => f.status === "verified"))
      throw new ApiError(
        400,
        "MFA_REQUIRED",
        "Enroll and verify a security factor first",
      );
    const recoveryCodes = Array.from({ length: 8 }, () =>
      randomBytes(20)
        .toString("hex")
        .match(/.{1,5}/g)!
        .join("-"),
    );
    await transaction(async (tx) => {
      await tx.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
        session.user.id,
      ]);
      await tx.query("DELETE FROM auth_recovery_codes WHERE user_id=$1", [
        session.user.id,
      ]);
      for (const code of recoveryCodes) {
        await tx.query(
          "INSERT INTO auth_recovery_codes(user_id,code_hash) VALUES($1,$2)",
          [
            session.user.id,
            digest(
              `${session.user.id}:${code.replaceAll("-", "")}`,
              "recovery",
            ),
          ],
        );
      }
      await audit(
        req,
        "auth.recovery_codes_generated",
        session.user.id,
        session.user.id,
        { count: 8 },
        tx,
      );
    });
    return {
      message: "Save these one-time recovery codes. They are shown only once",
      recoveryCodes,
    };
  }
  if (input.action === "recover-mfa") {
    // App-owned recovery policy, NOT a claim of provider AAL2. Primary identity is
    // still verified by Supabase; recovery forces logout and native re-enrollment.
    requireFresh(session);
    await authLimit(req, "mfa-recovery", session.user.id, 5, 900);
    const hash = digest(
      `${session.user.id}:${input.code.toLowerCase().replaceAll("-", "")}`,
      "recovery",
    );
    const accepted = await transaction(async (tx) => {
      const result = await tx.query(
        `UPDATE auth_recovery_codes SET used_at=now()
        WHERE user_id=$1 AND code_hash=$2 AND used_at IS NULL RETURNING id`,
        [session.user.id, hash],
      );
      if (!result.rows[0]) return false;
      await tx.query(
        "UPDATE users SET mfa_recovery_required=true WHERE id=$1",
        [session.user.id],
      );
      await tx.query(
        "UPDATE sessions SET revoked_at=now(),encrypted_credentials=NULL WHERE user_id=$1",
        [session.user.id],
      );
      await audit(
        req,
        "auth.mfa_recovery_started",
        session.user.id,
        session.user.id,
        {},
        tx,
      );
      return true;
    });
    if (!accepted)
      throw new ApiError(
        400,
        "RECOVERY_CODE_INVALID",
        "This recovery code is invalid or already used",
      );
    res.clearCookie("__Host-ps-session", {
      httpOnly: true,
      secure: true,
      path: "/",
      sameSite: "none",
    });
    for (const factor of existing) {
      const removed = await adminClient().auth.admin.mfa.deleteFactor({
        id: factor.id,
        userId: session.providerUser.id,
      });
      providerFailure(removed.error);
    }
    await transaction(async (tx) => {
      await tx.query("DELETE FROM auth_recovery_codes WHERE user_id=$1", [
        session.user.id,
      ]);
      await tx.query(
        "INSERT INTO notifications(user_id,title,body) VALUES($1,$2,$3)",
        [
          session.user.id,
          "MFA account recovery",
          "Your security factors were reset using a recovery code. All sessions are revoked. Sign in and enroll a new factor.",
        ],
      );
      await audit(
        req,
        "auth.mfa_recovered",
        session.user.id,
        session.user.id,
        {},
        tx,
      );
    });
    await revokeSessions(req, res, session, true);
    return {
      message:
        "Sign in and enroll a new security factor. Account access remains restricted until verification",
      signedOut: true,
    };
  }
  throw new ApiError(400, "INVALID_ACTION", "Unsupported security action");
}
