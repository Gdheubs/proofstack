import { pool } from "@workspace/db";
import type { Request } from "express";
import { digest } from "../lib/auth-crypto";
import { rateLimitAddress } from "../lib/client-ip";
import { ApiError } from "../lib/errors";
import { consumeRateLimit } from "./rate-limit";
import { writeAuditEvent } from "./audit";

export async function authLimit(
  req: Request,
  purpose: string,
  identifier?: string,
  max = 10,
  seconds = 600,
  perNetwork = false,
) {
  // Without an account identifier, the budget belongs to this client alone.
  // Named accounts retain both their cross-IP budget and the broader IP cap.
  const limits: [string, number][] = [
    [
      `auth:ip:${purpose}:${digest(rateLimitAddress(req), "rate-ip")}`,
      identifier === undefined ? max : max * 3,
    ],
  ];
  if (identifier !== undefined && perNetwork) {
    // Guessing budgets: one network cannot exhaust another network's budget
    // for the same account, while a wide account-level cap still applies.
    limits.push(
      [
        `auth:idnet:${purpose}:${digest(networkKey(req, identifier), "rate-id")}`,
        max,
      ],
      [
        `auth:id:${purpose}:${digest(identifier.toLowerCase(), "rate-id")}`,
        max * 5,
      ],
    );
  } else if (identifier !== undefined) {
    limits.push([
      `auth:id:${purpose}:${digest(identifier.toLowerCase(), "rate-id")}`,
      max,
    ]);
  }
  for (const [key, count] of limits) {
    const result = await consumeRateLimit(key, seconds, count);
    if (!result.allowed)
      throw new ApiError(
        429,
        "AUTH_RATE_LIMITED",
        `Please wait ${result.resetSeconds} seconds before trying again`,
      );
  }
}
// Locks apply to an account from one client network, so failures from
// elsewhere cannot lock the owner out of their own account.
const networkKey = (req: Request, identifier: string) =>
  `${identifier.toLowerCase()}|${rateLimitAddress(req)}`;
const failureKey = (req: Request, identifier: string) =>
  digest(networkKey(req, identifier), "failure");
export async function checkLock(req: Request, identifier: string) {
  const { rows } = await pool.query(
    "SELECT locked_until FROM auth_failures WHERE identifier_hash=$1",
    [failureKey(req, identifier)],
  );
  if (
    rows[0]?.locked_until &&
    new Date(rows[0].locked_until).getTime() > Date.now()
  ) {
    throw new ApiError(
      429,
      "ACCOUNT_TEMPORARILY_LOCKED",
      "Too many failed attempts. Try again after 15 minutes",
    );
  }
}
export async function failedAttempt(req: Request, identifier: string) {
  const { rows } = await pool.query(
    `INSERT INTO auth_failures (identifier_hash,failures) VALUES ($1,1)
    ON CONFLICT (identifier_hash) DO UPDATE SET
    failures=CASE WHEN auth_failures.window_started_at < now()-interval '15 minutes' THEN 1 ELSE auth_failures.failures+1 END,
    window_started_at=CASE WHEN auth_failures.window_started_at < now()-interval '15 minutes' THEN now() ELSE auth_failures.window_started_at END,
    locked_until=CASE WHEN auth_failures.window_started_at >= now()-interval '15 minutes' AND auth_failures.failures>=4
      THEN now()+interval '15 minutes' ELSE NULL END RETURNING locked_until`,
    [failureKey(req, identifier)],
  );
  await writeAuditEvent({
    action: rows[0].locked_until ? "auth.account_locked" : "auth.login_failed",
    resourceType: "identity",
    requestId: String(req.id),
    metadata: { identifierHash: failureKey(req, identifier) },
  });
}
export async function clearFailures(req: Request, identifier: string) {
  await pool.query("DELETE FROM auth_failures WHERE identifier_hash=$1", [
    failureKey(req, identifier),
  ]);
}
