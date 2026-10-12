import type { Request, Response } from "express";
import { Webhook } from "standardwebhooks";
import { z } from "zod/v4";
import { pool } from "@workspace/db";
import { createHash } from "node:crypto";
import { smsConfigured } from "../lib/auth-config";
import { ApiError } from "../lib/errors";
import { audit } from "../services/auth-sessions";
import { authLimit } from "../services/auth-limits";

const hookSchema = z.object({
  user: z.object({
    id: z.uuid(),
    phone: z.string().regex(/^\+?[1-9]\d{7,14}$/),
  }),
  sms: z.object({ otp: z.string().regex(/^\d{6,10}$/) }),
});

export async function sendSmsHook(req: Request, res: Response) {
  res.set("Cache-Control", "no-store");
  if (!smsConfigured())
    throw new ApiError(
      503,
      "SMS_SETUP_REQUIRED",
      "SMS delivery is not configured",
    );
  if (!Buffer.isBuffer(req.body))
    throw new ApiError(
      400,
      "INVALID_HOOK",
      "A signed raw JSON payload is required",
    );
  const hookId = req.get("webhook-id") || "";
  const secret = process.env.SUPABASE_SMS_HOOK_SECRET!.replace(/^v1,/, "");
  let verified: unknown;
  try {
    verified = new Webhook(secret).verify(req.body.toString("utf8"), {
      "webhook-id": hookId,
      "webhook-timestamp": req.get("webhook-timestamp") || "",
      "webhook-signature": req.get("webhook-signature") || "",
    });
  } catch {
    throw new ApiError(
      401,
      "HOOK_SIGNATURE_INVALID",
      "SMS hook signature could not be verified",
    );
  }
  const parsed = hookSchema.safeParse(verified);
  if (!parsed.success)
    throw new ApiError(
      400,
      "INVALID_HOOK",
      "Invalid provider SMS hook payload",
    );
  const payload = parsed.data;
  // The signed random event ID needs no secret. Keep receipts stable across
  // session-encryption key rotation so retries cannot cause duplicate delivery.
  const eventHash = createHash("sha256").update(hookId).digest("hex");
  const known = await pool.query(
    "SELECT status FROM auth_hook_receipts WHERE event_hash=$1",
    [eventHash],
  );
  if (known.rows[0]?.status === "accepted") {
    res.json({});
    return;
  }
  if (known.rows[0])
    throw new ApiError(
      503,
      "SMS_DELIVERY_PENDING",
      "SMS delivery outcome is pending",
    );
  await authLimit(req, "sms-hook", payload.user.phone, 3, 600);
  const inserted = await pool.query(
    `INSERT INTO auth_hook_receipts(event_hash) VALUES($1)
    ON CONFLICT(event_hash) DO NOTHING RETURNING event_hash`,
    [eventHash],
  );
  if (!inserted.rowCount)
    throw new ApiError(
      503,
      "SMS_DELIVERY_PENDING",
      "SMS delivery outcome is pending",
    );
  // MSG91 transports exactly the Supabase-issued code. It never verifies it,
  // generates the app's identity, or supplies a separate authentication token.
  const url = new URL("https://control.msg91.com/api/v5/otp");
  url.searchParams.set("template_id", process.env.MSG91_OTP_TEMPLATE_ID!);
  url.searchParams.set("mobile", payload.user.phone.replace(/^\+/, ""));
  url.searchParams.set("otp", payload.sms.otp);
  url.searchParams.set("realTimeResponse", "1");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authkey: process.env.MSG91_AUTH_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ otp: payload.sms.otp }),
    signal: AbortSignal.timeout(3500),
  });
  const result = (await response.json()) as { type?: string };
  if (!response.ok || result.type !== "success")
    throw new ApiError(
      503,
      "SMS_DELIVERY_FAILED",
      "SMS provider did not accept delivery",
    );
  await pool.query(
    "UPDATE auth_hook_receipts SET status='accepted',accepted_at=now() WHERE event_hash=$1",
    [eventHash],
  );
  await audit(req, "auth.sms_delivery_accepted");
  res.json({});
}
