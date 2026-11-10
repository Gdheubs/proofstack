import { createHash, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import type { Request, RequestHandler } from "express";
import { ApiError } from "./errors";

// Must match artifacts/proofstack/proxy.ts.
export const CLIENT_IP_HEADER = "x-proofstack-client-ip";
export const PROXY_SECRET_HEADER = "x-proofstack-proxy-secret";

const forwarded = new WeakMap<Request, string>();
const proven = new WeakSet<Request>();
const digest = (value: string) => createHash("sha256").update(value).digest();

// Behind the web tier every request arrives from the same proxy address, so
// only the web tier may name the browser's address, proven by a shared secret.
// Without a valid secret the forwarded value is discarded, never trusted.
export function trustedProxyClient(secret?: string): RequestHandler {
  const expected = secret ? digest(secret) : null;
  return (req, _res, next) => {
    const supplied = req.get(PROXY_SECRET_HEADER);
    const address = req.get(CLIENT_IP_HEADER)?.trim();
    delete req.headers[PROXY_SECRET_HEADER];
    delete req.headers[CLIENT_IP_HEADER];
    if (expected && supplied && timingSafeEqual(digest(supplied), expected)) {
      proven.add(req);
      if (address && isIP(address)) forwarded.set(req, address);
    }
    next();
  };
}

// Paths that are called directly rather than through the web tier: health
// probes from the host, and the signed auth-provider hook.
const DIRECT_PATHS = new Set([
  "/api/healthz",
  "/api/readyz",
  "/api/auth/hooks/send-sms",
]);
// With PROXY_REQUIRED=true (and a shared secret), the API answers only
// requests relayed by the web tier, so its own address cannot be used to
// bypass the site's protections.
export function requireProxy(secret?: string): RequestHandler {
  return (req, _res, next) => {
    if (
      process.env.PROXY_REQUIRED !== "true" ||
      !secret ||
      proven.has(req) ||
      DIRECT_PATHS.has(req.path)
    )
      return next();
    next(
      new ApiError(403, "PROXY_REQUIRED", "Use ProofStack at its site address"),
    );
  };
}

function ipv6Prefix(address: string) {
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(address);
  if (mapped) return mapped[1];
  const [head, tail] = address.split("%")[0].split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const width = (groups: string[]) =>
    groups.reduce((n, group) => n + (group.includes(".") ? 2 : 1), 0);
  const groups = [
    ...left,
    ...Array(Math.max(0, 8 - width(left) - width(right))).fill("0"),
    ...right,
  ];
  return (
    groups
      .slice(0, 4)
      .map((group) => parseInt(group, 16).toString(16))
      .join(":") + "::/64"
  );
}

// Rate-limit subject for this client. One IPv6 subscriber usually controls a
// whole /64, so per-address IPv6 buckets would be trivial to rotate around.
export function rateLimitAddress(req: Request) {
  const address =
    forwarded.get(req) ?? req.ip ?? req.socket.remoteAddress ?? "unknown";
  return isIP(address) === 6 ? ipv6Prefix(address) : address;
}
