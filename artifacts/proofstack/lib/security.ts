export function buildContentSecurityPolicy(
  nonce: string,
  development: boolean,
): string {
  if (!/^[A-Za-z0-9+/=]+$/.test(nonce)) {
    throw new Error("Invalid CSP nonce");
  }
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${development ? " ws: wss:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    `frame-ancestors 'self'${development ? " https://replit.com https://*.replit.com https://*.replit.dev" : ""}`,
    ...(development ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}
