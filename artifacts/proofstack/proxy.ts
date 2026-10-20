import { randomBytes, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { buildContentSecurityPolicy } from "./lib/security";

// Must match artifacts/api-server/src/lib/client-ip.ts.
export const CLIENT_IP_HEADER = "x-proofstack-client-ip";
export const PROXY_SECRET_HEADER = "x-proofstack-proxy-secret";
// Headers the hosting edge sets itself, overwriting any client-sent copy.
// Choose the one matching the actual host; others are spoofable there.
const CLIENT_IP_SOURCES = ["cf-connecting-ip", "x-real-ip"];

// Every API request reaches Express from this tier's address, so name the
// browser's address explicitly and prove it with the shared secret.
function forwardApi(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.delete(CLIENT_IP_HEADER);
  headers.delete(PROXY_SECRET_HEADER);
  const secret = process.env.PROXY_SHARED_SECRET;
  const source = process.env.TRUSTED_CLIENT_IP_HEADER?.toLowerCase();
  const address =
    source && CLIENT_IP_SOURCES.includes(source)
      ? request.headers.get(source)?.trim()
      : undefined;
  if (secret && address && /^[0-9A-Fa-f:.]{2,45}$/.test(address)) {
    headers.set(CLIENT_IP_HEADER, address);
    headers.set(PROXY_SECRET_HEADER, secret);
  }
  return NextResponse.next({ request: { headers } });
}

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path === "/api" || path.startsWith("/api/")) return forwardApi(request);
  const nonce = randomBytes(16).toString("base64");
  const requestId = randomUUID();
  const policy = buildContentSecurityPolicy(
    nonce,
    process.env.NODE_ENV !== "production",
    process.env.FIREBASE_WEB_AUTH_DOMAIN,
  );
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("x-request-id", requestId);
  headers.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", policy);
  response.headers.set("X-Request-ID", requestId);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
