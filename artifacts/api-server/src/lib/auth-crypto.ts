import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { ApiError } from "./errors";

// Saved GitHub tokens get their own secret when GITHUB_TOKEN_SECRET is set,
// so a leaked session secret does not also unlock them.
const OWN_SECRET: Record<string, string> = {
  "github-token": "GITHUB_TOKEN_SECRET",
};
const strong = (secret?: string) =>
  secret && secret.length >= 32 ? secret : null;
const derive = (secret: string, purpose: string) =>
  Buffer.from(hkdfSync("sha256", secret, "proofstack-auth", purpose, 32));

function key(purpose: string) {
  const own = OWN_SECRET[purpose];
  const secret =
    (own && strong(process.env[own])) || strong(process.env.SESSION_SECRET);
  if (!secret)
    throw new ApiError(
      503,
      "AUTH_CONFIGURATION_REQUIRED",
      "A strong session encryption secret is required",
    );
  return derive(secret, purpose);
}
// Keys that may still open values sealed before a secret changed: the session
// secret (for tokens sealed before their own secret existed) and
// SESSION_SECRET_PREVIOUS while a rotation settles.
function olderKeys(purpose: string) {
  const current = key(purpose);
  return [process.env.SESSION_SECRET, process.env.SESSION_SECRET_PREVIOUS]
    .map(strong)
    .filter((s): s is string => Boolean(s))
    .map((s) => derive(s, purpose))
    .filter((k) => !k.equals(current));
}
export function opaqueHandle() {
  return randomBytes(32).toString("base64url");
}
export function digest(value: string, purpose = "lookup") {
  return createHmac("sha256", key(purpose)).update(value).digest("hex");
}
export function seal(value: unknown, purpose = "session") {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(purpose), iv, {
    authTagLength: 16,
  });
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
  if (
    parts.length !== 3 ||
    parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))
  )
    throw new Error("Invalid encrypted credential envelope");
  const [iv, tag, encrypted] = parts.map((p) => Buffer.from(p, "base64url"));
  if (
    iv.length !== 12 ||
    tag.length !== 16 ||
    encrypted.length === 0 ||
    [iv, tag, encrypted].some(
      (part, index) => part.toString("base64url") !== parts[index],
    )
  )
    throw new Error("Invalid encrypted credential envelope");
  const open = (k: Buffer) => {
    const cipher = createDecipheriv("aes-256-gcm", k, iv, {
      authTagLength: 16,
    });
    cipher.setAAD(Buffer.from(`proofstack:${purpose}:v1`));
    cipher.setAuthTag(tag);
    return JSON.parse(
      Buffer.concat([cipher.update(encrypted), cipher.final()]).toString(
        "utf8",
      ),
    ) as T;
  };
  try {
    return open(key(purpose));
  } catch (error) {
    for (const older of olderKeys(purpose)) {
      try {
        return open(older);
      } catch {
        // Try the next key.
      }
    }
    throw error;
  }
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
    [key("csrf"), ...olderKeys("csrf")].some((k) =>
      safeEqual(
        parts[1],
        createHmac("sha256", k).update(parts[0]).digest("hex"),
      ),
    )
  );
}
