// The Turnstile bot check (features/auth/turnstile.tsx) loads its script and
// challenge frame from Cloudflare.
const TURNSTILE = " https://challenges.cloudflare.com";
// Video players that posts may embed (see features/community/video-link.ts).
const VIDEO_FRAMES =
  " https://www.youtube-nocookie.com https://player.vimeo.com https://www.loom.com";

export function buildContentSecurityPolicy(
  nonce: string,
  development: boolean,
): string {
  if (!/^[A-Za-z0-9+/=]+$/.test(nonce)) {
    throw new Error("Invalid CSP nonce");
  }
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${TURNSTILE}${development ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${development ? " ws: wss:" : ""}`,
    `frame-src 'self'${VIDEO_FRAMES}${TURNSTILE}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
    ...(development ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}
