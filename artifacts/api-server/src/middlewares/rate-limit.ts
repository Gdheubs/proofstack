import { createHash } from "node:crypto";
import type { Request, RequestHandler } from "express";
import { pool } from "@workspace/db";
import { digest } from "../lib/auth-crypto";
import { rateLimitAddress } from "../lib/client-ip";
import { env } from "../lib/env";
import { ApiError } from "../lib/errors";
import { consumeRateLimit } from "../services/rate-limit";

// Carrier-grade NAT and office networks put many people behind one address.
// Past the per-address allowance, a request with a live session counts
// against its own account, up to this multiple of the allowance per address.
export const SHARED_NETWORK_CEILING = 10;
const SESSION = /(?:^|;\s*)__Host-ps-session=([A-Za-z0-9_-]{43})(?:;|$)/;

async function sessionAccount(req: Request): Promise<string | null> {
  const handle = SESSION.exec(req.headers.cookie ?? "")?.[1];
  if (!handle) return null;
  const { rows } = await pool.query<{ user_id: string }>(
    "SELECT user_id FROM sessions WHERE handle_hash=$1 AND revoked_at IS NULL AND expires_at>now()",
    [digest(handle)],
  );
  return rows[0]?.user_id ?? null;
}

export const apiRateLimit: RequestHandler = async (
  req,
  res,
  next,
): Promise<void> => {
  // Health probes remain available when PostgreSQL is unavailable.
  if (req.path === "/healthz" || req.path === "/readyz") {
    next();
    return;
  }
  const key = `api:${createHash("sha256")
    .update(rateLimitAddress(req))
    .digest("hex")}`;
  const max = env.RATE_LIMIT_MAX;
  const window = env.RATE_LIMIT_WINDOW_SECONDS;
  try {
    const network = await consumeRateLimit(
      key,
      window,
      max * SHARED_NETWORK_CEILING,
    );
    const used = max * SHARED_NETWORK_CEILING - network.remaining;
    let result = {
      allowed: network.allowed && used <= max,
      remaining: Math.max(0, max - used),
      resetSeconds: network.resetSeconds,
    };
    if (network.allowed && !result.allowed) {
      const account = await sessionAccount(req);
      if (account)
        result = await consumeRateLimit(`api:account:${account}`, window, max);
    }
    res.setHeader("RateLimit-Limit", max);
    res.setHeader("RateLimit-Remaining", result.remaining);
    res.setHeader("RateLimit-Reset", result.resetSeconds);
    if (!result.allowed) {
      res.setHeader("Retry-After", result.resetSeconds);
      next(
        new ApiError(
          429,
          "RATE_LIMITED",
          "Too many requests; retry after the indicated interval",
        ),
      );
      return;
    }
    next();
  } catch {
    next(
      new ApiError(
        503,
        "RATE_LIMIT_UNAVAILABLE",
        "Request protection is temporarily unavailable",
      ),
    );
  }
};
