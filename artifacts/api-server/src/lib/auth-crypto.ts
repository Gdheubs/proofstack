import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { ApiError } from "./errors";

function key(purpose: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32)
    throw new ApiError(
      503,
      "AUTH_CONFIGURATION_REQUIRED",
      "A strong session encryption secret is required",
    );
  return Buffer.from(
    hkdfSync("sha256", secret, "proofstack-auth", purpose, 32),
  );
}
export function opaqueHandle() {
  return randomBytes(32).toString("base64url");
}
export function digest(value: string, purpose = "lookup") {
  return createHmac("sha256", key(purpose)).update(value).digest("hex");
}
export function seal(value: unknown, purpose = "session") {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(purpose), iv);
  cipher.setAAD(Buffer.from(`proofstack:${purpose}:v1`));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value)),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), encrypted]
    .map((b) => b.toString("base64url"))
    .join(".");
}
export function unseal<T>(value: string, purpose = "session"): T {
  const parts = value.split(".");
  if (parts.length !== 3)
    throw new Error("Invalid encrypted credential envelope");
  const [iv, tag, encrypted] = parts.map((p) => Buffer.from(p, "base64url"));
  const cipher = createDecipheriv("aes-256-gcm", key(purpose), iv);
  cipher.setAAD(Buffer.from(`proofstack:${purpose}:v1`));
  cipher.setAuthTag(tag);
  return JSON.parse(
    Buffer.concat([cipher.update(encrypted), cipher.final()]).toString("utf8"),
  ) as T;
}
export function safeEqual(a: string, b: string) {
  const aa = Buffer.from(a),
    bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
export function signedNonce() {
  const nonce = opaqueHandle();
  return `${nonce}.${digest(nonce, "csrf")}`;
}
export function validNonce(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parts = value.split(".");
  return (
    parts.length === 2 &&
    /^[A-Za-z0-9_-]{43}$/.test(parts[0]) &&
    safeEqual(parts[1], digest(parts[0], "csrf"))
  );
}
