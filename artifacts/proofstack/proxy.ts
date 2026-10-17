import { randomBytes, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { buildContentSecurityPolicy } from "./lib/security";

export function proxy(request: NextRequest) {
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
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
