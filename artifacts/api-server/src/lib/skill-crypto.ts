import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { ApiError } from "./errors";

type KeyEntry = { id: string; secret: Buffer };
const MIN_SECRET_BYTES = 32;
const MAX_TICKET_TTL_SECONDS = 10 * 60;
const MAX_MEDIA_BYTES = 314_572_800;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function unavailable(): ApiError {
  return new ApiError(
    503,
    "FEATURE_UNAVAILABLE",
    "The requested feature is not configured",
  );
}

function parseKeyRing(value = process.env.SKILL_KEY_RING): KeyEntry[] {
  if (!value?.trim()) throw unavailable();
  const entries = value.split(",").map((part) => {
    const colon = part.indexOf(":");
    if (colon < 1) throw unavailable();
    const id = part.slice(0, colon).trim();
    const rawSecret = part.slice(colon + 1).trim();
    const secret = Buffer.from(rawSecret, "utf8");
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(id) || secret.length < MIN_SECRET_BYTES)
      throw unavailable();
    return { id, secret };
  });
  if (new Set(entries.map(({ id }) => id)).size !== entries.length)
    throw unavailable();
  return entries;
}

export function skillKeyRingConfigured(): boolean {
  try {
    parseKeyRing();
    return true;
  } catch {
    return false;
  }
}

function derive(secret: Buffer, purpose: string): Buffer {
  return Buffer.from(
    hkdfSync(
      "sha256",
      secret,
      Buffer.from("proofstack-skill-v1"),
      Buffer.from(`proofstack:${purpose}`),
      32,
    ),
  );
}

function hmac(secret: Buffer, purpose: string, value: string): Buffer {
  return createHmac("sha256", derive(secret, purpose)).update(value).digest();
}

function safeEqual(left: Buffer, right: Buffer): boolean {
  return left.length === right.length && timingSafeEqual(left, right);
}

export type SealedValue = { key_id: string; sealed: string };

/** AES-256-GCM seal; callers persist key_id beside the opaque ciphertext. */
export function seal(value: unknown, purpose: string): SealedValue {
  const [{ id, secret }] = parseKeyRing();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", derive(secret, purpose), iv);
  cipher.setAAD(Buffer.from(`proofstack:${purpose}:v1`));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return {
    key_id: id,
    sealed: [iv, cipher.getAuthTag(), encrypted]
      .map((part) => part.toString("base64url"))
      .join("."),
  };
}

/** Opens with the named key only; unknown key ids fail closed. */
export function unseal<T>(value: SealedValue, purpose: string): T {
  let entry: KeyEntry | undefined;
  try {
    entry = parseKeyRing().find(({ id }) => id === value.key_id);
  } catch {
    throw new Error("Unable to open sealed value");
  }
  if (!entry || typeof value.sealed !== "string")
    throw new Error("Unable to open sealed value");
  const parts = value.sealed.split(".");
  if (
    parts.length !== 3 ||
    parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))
  )
    throw new Error("Unable to open sealed value");
  const [iv, tag, encrypted] = parts.map((part) =>
    Buffer.from(part, "base64url"),
  );
  if (
    iv.length !== 12 ||
    tag.length !== 16 ||
    encrypted.length === 0 ||
    [iv, tag, encrypted].some(
      (part, index) => part.toString("base64url") !== parts[index],
    )
  )
    throw new Error("Unable to open sealed value");
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      derive(entry.secret, purpose),
      iv,
    );
    decipher.setAAD(Buffer.from(`proofstack:${purpose}:v1`));
    decipher.setAuthTag(tag);
    const opened = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString("utf8");
    return JSON.parse(opened) as T;
  } catch {
    throw new Error("Unable to open sealed value");
  }
}

export function ledgerPseudonym(userId: string): string {
  const secret = process.env.LEDGER_PSEUDONYM_SECRET;
  if (!secret || Buffer.byteLength(secret) < MIN_SECRET_BYTES)
    throw unavailable();
  return createHmac("sha256", secret)
    .update("proofstack:ledger-actor:v1\0")
    .update(userId)
    .digest("hex");
}

export type AttemptCredentialClaims = {
  attemptId: string;
  sessionId: string;
  lease: string;
  exp: number;
};
export type AttemptCredentialBinding = Pick<
  AttemptCredentialClaims,
  "attemptId" | "sessionId" | "lease"
>;

function attemptPayload(claims: AttemptCredentialClaims): string {
  return `v1.${claims.attemptId}.${claims.sessionId}.${claims.lease}.${claims.exp}`;
}

export function createAttemptCredential(
  claims: AttemptCredentialClaims,
): string {
  if (
    !UUID.test(claims.attemptId) ||
    !UUID.test(claims.sessionId) ||
    !UUID.test(claims.lease) ||
    !Number.isSafeInteger(claims.exp)
  )
    throw new TypeError("Invalid attempt credential claims");
  const [current] = parseKeyRing();
  const payload = attemptPayload(claims);
  return `${payload}.${hmac(current.secret, "attempt-credential", payload).toString("base64url")}`;
}

export function verifyAttemptCredential(
  token: unknown,
  expected: AttemptCredentialBinding,
  now = Date.now(),
): AttemptCredentialClaims | null {
  if (
    !expected ||
    !UUID.test(expected.attemptId) ||
    !UUID.test(expected.sessionId) ||
    !UUID.test(expected.lease)
  )
    return null;
  if (typeof token !== "string" || token.length > 512) return null;
  const parts = token.split(".");
  if (parts.length !== 6 || parts[0] !== "v1") return null;
  const [version, attemptId, sessionId, lease, expText, macText] = parts;
  const exp = Number(expText);
  if (
    version !== "v1" ||
    !UUID.test(attemptId) ||
    !UUID.test(sessionId) ||
    !UUID.test(lease) ||
    !/^\d{1,12}$/.test(expText) ||
    !Number.isSafeInteger(exp) ||
    exp * 1000 <= now ||
    !/^[A-Za-z0-9_-]{43}$/.test(macText)
  )
    return null;
  const claims = { attemptId, sessionId, lease, exp };
  if (
    expected.attemptId !== attemptId ||
    expected.sessionId !== sessionId ||
    expected.lease !== lease
  )
    return null;
  let entries: KeyEntry[];
  try {
    entries = parseKeyRing();
  } catch {
    return null;
  }
  const supplied = Buffer.from(macText, "base64url");
  if (supplied.toString("base64url") !== macText) return null;
  const payload = attemptPayload(claims);
  const valid = entries.reduce(
    (matched, entry) =>
      safeEqual(supplied, hmac(entry.secret, "attempt-credential", payload)) ||
      matched,
    false,
  );
  return valid ? claims : null;
}

export type MediaTicketPurpose =
  "create" | "part" | "put" | "complete" | "play";

export type MediaTicketClaims = {
  v: 1;
  aud: string;
  purpose: MediaTicketPurpose;
  mediaId: string;
  owner: string;
  part?: number;
  maxBytes: number;
  iat: number;
  exp: number;
};

export type NewMediaTicket = {
  aud: string;
  purpose: MediaTicketPurpose;
  mediaId: string;
  owner: string;
  part?: number;
  maxBytes: number;
  exp: number;
};
export type MediaTicketBinding = Pick<
  NewMediaTicket,
  "aud" | "purpose" | "mediaId" | "owner"
> & { part?: number };

function mediaSecret(): Buffer {
  const secret = process.env.MEDIA_TICKET_SECRET;
  if (!secret || Buffer.byteLength(secret) < MIN_SECRET_BYTES)
    throw unavailable();
  return Buffer.from(secret, "utf8");
}

function encodeTicket(claims: MediaTicketClaims): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = createHmac("sha256", mediaSecret())
    .update(`v1.${payload}`)
    .digest("base64url");
  return `${payload}.${signature}`;
}

export function createMediaTicket(
  input: NewMediaTicket,
  now = Date.now(),
): string {
  const iat = Math.floor(now / 1000);
  if (
    !input.aud ||
    input.aud.length > 80 ||
    !UUID.test(input.mediaId) ||
    !/^[A-Za-z0-9_-]{32,128}$/.test(input.owner) ||
    !["create", "part", "put", "complete", "play"].includes(input.purpose) ||
    !Number.isSafeInteger(input.maxBytes) ||
    input.maxBytes < 1 ||
    input.maxBytes > MAX_MEDIA_BYTES ||
    !Number.isSafeInteger(input.exp) ||
    input.exp <= iat ||
    input.exp - iat > MAX_TICKET_TTL_SECONDS ||
    (input.purpose === "part" &&
      (!Number.isInteger(input.part) || (input.part as number) < 1)) ||
    (input.purpose !== "part" && input.part !== undefined)
  )
    throw new TypeError("Invalid media ticket claims");
  return encodeTicket({ v: 1, ...input, iat });
}

export function verifyMediaTicket(
  ticket: unknown,
  expected: MediaTicketBinding,
  now = Date.now(),
): MediaTicketClaims | null {
  if (
    !expected ||
    typeof expected.aud !== "string" ||
    !expected.aud ||
    !["create", "part", "put", "complete", "play"].includes(expected.purpose) ||
    !UUID.test(expected.mediaId) ||
    !/^[A-Za-z0-9_-]{32,128}$/.test(expected.owner) ||
    (expected.purpose === "part" &&
      (!Number.isInteger(expected.part) || (expected.part as number) < 1)) ||
    (expected.purpose !== "part" && expected.part !== undefined)
  )
    return null;
  if (typeof ticket !== "string" || ticket.length > 2048) return null;
  const [payload, signature, extra] = ticket.split(".");
  if (
    !payload ||
    !signature ||
    extra !== undefined ||
    !/^[A-Za-z0-9_-]+$/.test(payload) ||
    !/^[A-Za-z0-9_-]{43}$/.test(signature)
  )
    return null;
  let secret: Buffer;
  let claims: unknown;
  try {
    secret = mediaSecret();
    const bytes = Buffer.from(payload, "base64url");
    if (bytes.toString("base64url") !== payload) return null;
    claims = JSON.parse(bytes.toString("utf8")) as unknown;
    const supplied = Buffer.from(signature, "base64url");
    if (supplied.toString("base64url") !== signature) return null;
    const wanted = createHmac("sha256", secret)
      .update(`v1.${payload}`)
      .digest();
    if (!safeEqual(supplied, wanted)) return null;
  } catch {
    return null;
  }
  if (!claims || typeof claims !== "object" || Array.isArray(claims))
    return null;
  const c = claims as Partial<MediaTicketClaims>;
  const seconds = Math.floor(now / 1000);
  if (
    c.v !== 1 ||
    !c.aud ||
    typeof c.aud !== "string" ||
    !["create", "part", "put", "complete", "play"].includes(
      c.purpose as string,
    ) ||
    typeof c.mediaId !== "string" ||
    !UUID.test(c.mediaId) ||
    typeof c.owner !== "string" ||
    !/^[A-Za-z0-9_-]{32,128}$/.test(c.owner) ||
    !Number.isSafeInteger(c.maxBytes) ||
    (c.maxBytes as number) < 1 ||
    (c.maxBytes as number) > MAX_MEDIA_BYTES ||
    !Number.isSafeInteger(c.iat) ||
    !Number.isSafeInteger(c.exp) ||
    (c.iat as number) > seconds ||
    (c.exp as number) <= seconds ||
    (c.exp as number) <= (c.iat as number) ||
    (c.exp as number) - (c.iat as number) > MAX_TICKET_TTL_SECONDS ||
    (c.purpose === "part" &&
      (!Number.isInteger(c.part) || (c.part as number) < 1)) ||
    (c.purpose !== "part" && c.part !== undefined)
  )
    return null;
  const expectedKeys: (keyof MediaTicketBinding)[] = [
    "aud",
    "purpose",
    "mediaId",
    "owner",
    "part",
  ];
  for (const key of expectedKeys) {
    if (expected[key] !== undefined && expected[key] !== c[key]) return null;
  }
  return c as MediaTicketClaims;
}
