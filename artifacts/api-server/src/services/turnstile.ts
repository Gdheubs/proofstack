import { ApiError } from "../lib/errors";
import { logger } from "../lib/logger";
import { rateLimitAddress } from "../lib/client-ip";
import type { Request } from "express";

// Cloudflare Turnstile: a bot check on sign-up, password reset and demo
// publishing. It is on when TURNSTILE_SECRET_KEY is set (the site key is
// public and served to the browser). Each token is checked once with
// Cloudflare; a failed or missing token refuses the action. If Cloudflare
// cannot be reached the action is allowed, so an outage there never locks
// members out.
export const TURNSTILE_SCRIPT =
  "https://challenges.cloudflare.com/turnstile/v0/api.js";
const VERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export const turnstileEnabled = () =>
  Boolean(process.env.TURNSTILE_SECRET_KEY?.trim());
export const turnstileSiteKey = () =>
  turnstileEnabled() ? (process.env.TURNSTILE_SITE_KEY?.trim() ?? "") : "";

type Verdict = { success: boolean; action?: string; hostname?: string };

export async function assertHuman(
  req: Request,
  token: unknown,
  action: string,
  fetcher: typeof fetch = fetch,
) {
  if (!turnstileEnabled()) return;
  const failed = () =>
    new ApiError(
      400,
      "HUMAN_CHECK_FAILED",
      "The security check did not complete. Reload the page and try again.",
    );
  if (typeof token !== "string" || !/^[\w.-]{1,2048}$/.test(token))
    throw failed();
  const body = new URLSearchParams({
    secret: process.env.TURNSTILE_SECRET_KEY!.trim(),
    response: token,
    remoteip: rateLimitAddress(req).replace(/::\/64$/, "::"),
  });
  let verdict: Verdict;
  try {
    const response = await fetcher(VERIFY, {
      method: "POST",
      body,
      redirect: "error",
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) throw new Error(`status ${response.status}`);
    verdict = (await response.json()) as Verdict;
  } catch {
    logger.warn("Turnstile unavailable; request allowed");
    return;
  }
  // The token must have been issued for this action, not another form's.
  if (!verdict.success || (verdict.action && verdict.action !== action))
    throw failed();
}
