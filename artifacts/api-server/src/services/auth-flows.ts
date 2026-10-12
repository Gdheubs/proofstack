import { pool } from "@workspace/db";
import type { Request, Response } from "express";
import { digest, opaqueHandle, seal, unseal } from "../lib/auth-crypto";
import { ApiError } from "../lib/errors";
import { FLOW_COOKIE, flowCookieOptions } from "./auth-sessions";

export type AuthFlow = {
  type: "email" | "sms" | "signup" | "recovery" | "oauth" | "phone_change";
  identifier?: string;
  storage: Record<string, string>;
  csrf: string;
  userId?: string;
};
export async function createFlow(
  req: Request,
  res: Response,
  flow: Omit<AuthFlow, "csrf">,
) {
  const handle = opaqueHandle();
  await pool.query(
    `INSERT INTO auth_flows(handle_hash,encrypted_payload,expires_at)
    VALUES($1,$2,now()+$3*interval '1 second')`,
    [
      digest(handle, "flow"),
      seal(
        {
          ...flow,
          csrf: digest(req.cookies["__Host-ps-csrf"] || "", "flow-browser"),
        },
        "flow",
      ),
      flow.type === "email" ||
      flow.type === "sms" ||
      flow.type === "phone_change"
        ? 300
        : 1200,
    ],
  );
  res.cookie(FLOW_COOKIE, handle, flowCookieOptions);
  return handle;
}
export async function readFlow(
  req: Request,
  handle: unknown,
  callback = false,
) {
  if (
    typeof handle !== "string" ||
    !/^[A-Za-z0-9_-]{43}$/.test(handle) ||
    req.cookies?.[FLOW_COOKIE] !== handle
  ) {
    throw new ApiError(
      400,
      "VERIFICATION_EXPIRED",
      "Request a new verification in this browser",
    );
  }
  const { rows } = await pool.query(
    "SELECT encrypted_payload FROM auth_flows WHERE handle_hash=$1 AND expires_at>now()",
    [digest(handle, "flow")],
  );
  if (!rows[0])
    throw new ApiError(
      400,
      "VERIFICATION_EXPIRED",
      "This verification has expired. Request a new one",
    );
  const flow = unseal<AuthFlow>(rows[0].encrypted_payload, "flow");
  if (
    !callback &&
    flow.csrf !== digest(req.cookies["__Host-ps-csrf"] || "", "flow-browser")
  ) {
    throw new ApiError(
      403,
      "VERIFICATION_INVALID",
      "Request a new verification in this browser",
    );
  }
  return flow;
}
export async function consumeFlow(handle: string, res: Response) {
  await pool.query("DELETE FROM auth_flows WHERE handle_hash=$1", [
    digest(handle, "flow"),
  ]);
  res.clearCookie(FLOW_COOKIE, flowCookieOptions);
}
