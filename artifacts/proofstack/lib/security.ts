export function buildContentSecurityPolicy(
  nonce: string,
  development: boolean,
  firebaseAuthDomain?: string,
): string {
  if (!/^[A-Za-z0-9+/=]+$/.test(nonce)) {
    throw new Error("Invalid CSP nonce");
  }
  if (
    firebaseAuthDomain &&
    !/^[a-z][a-z0-9-]{4,28}[a-z0-9]\.firebaseapp\.com$/.test(firebaseAuthDomain)
  ) {
    throw new Error("Invalid Firebase auth domain for CSP");
  }
  const firebase = firebaseAuthDomain
    ? ` https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://${firebaseAuthDomain}`
    : "";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${firebase}${development ? " ws: wss:" : ""}`,
    `frame-src 'self'${firebaseAuthDomain ? ` https://${firebaseAuthDomain}` : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    `frame-ancestors 'self'${development ? " https://replit.com https://*.replit.com https://*.replit.dev" : ""}`,
    ...(development ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}
