import { randomBytes, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { buildContentSecurityPolicy } from "./lib/security";
import { internalPagesHidden } from "./lib/internal-pages";

// Development tools that answer 404 in production.
const INTERNAL_PAGES = ["/design-system", "/foundation"];

// Must match artifacts/api-server/src/lib/client-ip.ts.
export const CLIENT_IP_HEADER = "x-proofstack-client-ip";
export const PROXY_SECRET_HEADER = "x-proofstack-proxy-secret";
// Headers the hosting edge sets itself, overwriting any client-sent copy.
// Choose the one matching the actual host; others are spoofable there.
const CLIENT_IP_SOURCES = ["cf-connecting-ip", "x-real-ip"];
// Must match the /:owner/:repo.git rewrite in next.config.ts.
export const GIT_PATH =
  /^\/[^/]+\/[^/]+\.git\/(?:info\/refs|git-upload-pack|git-receive-pack)$/;

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
  // The secret also proves the request came through this tier
  // (PROXY_REQUIRED on the API), even when no address is available.
  if (secret) {
    headers.set(PROXY_SECRET_HEADER, secret);
    if (address && /^[0-9A-Fa-f:.]{2,45}$/.test(address))
      headers.set(CLIENT_IP_HEADER, address);
  }
  return NextResponse.next({ request: { headers } });
}

// The site's one address once a custom domain is set (NEXT_PUBLIC_SITE_URL).
function canonicalHost() {
  try {
    return new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "").host || null;
  } catch {
    return null;
  }
}

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  // Visitors on an old address (*.workers.dev, www) go to the canonical one.
  // API and Git calls are left alone so pages already open keep working.
  const canonical = canonicalHost();
  if (
    canonical &&
    request.nextUrl.host !== canonical &&
    (request.method === "GET" || request.method === "HEAD") &&
    !(path === "/api" || path.startsWith("/api/") || GIT_PATH.test(path))
  ) {
    const url = request.nextUrl.clone();
    url.protocol = "https:";
    url.host = canonical;
    return NextResponse.redirect(url, 301);
  }
  // Git clients use /<owner>/<repo>.git/…, which the API serves.
  if (path === "/api" || path.startsWith("/api/") || GIT_PATH.test(path))
    return forwardApi(request);
  const nonce = randomBytes(16).toString("base64");
  const requestId = randomUUID();
  const policy = buildContentSecurityPolicy(
    nonce,
    process.env.NODE_ENV !== "production",
  );
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("x-request-id", requestId);
  headers.set("Content-Security-Policy", policy);
  // A rewrite to an unmatched path renders the not-found page with status 404.
  const hidden =
    internalPagesHidden() &&
    INTERNAL_PAGES.some((p) => path === p || path.startsWith(`${p}/`));
  const response = hidden
    ? NextResponse.rewrite(new URL("/_internal-page-hidden", request.url), {
        request: { headers },
      })
    : NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", policy);
  response.headers.set("X-Request-ID", requestId);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
