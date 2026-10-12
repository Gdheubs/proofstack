import { createHash } from "node:crypto";
import type { RequestHandler } from "express";
import { env } from "../lib/env";
import { ApiError } from "../lib/errors";
import { consumeRateLimit } from "../services/rate-limit";

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
    .update(req.ip ?? req.socket.remoteAddress ?? "unknown")
    .digest("hex")}`;
  try {
    const result = await consumeRateLimit(
      key,
      env.RATE_LIMIT_WINDOW_SECONDS,
      env.RATE_LIMIT_MAX,
    );
    res.setHeader("RateLimit-Limit", env.RATE_LIMIT_MAX);
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
