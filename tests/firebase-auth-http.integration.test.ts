import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import express from "express";
import { createRequire } from "node:module";
const require = createRequire(
  new URL("../artifacts/api-server/package.json", import.meta.url),
);
const cookieParser: () => express.RequestHandler = require("cookie-parser");
import supertest from "supertest";

const sdk = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  verifySessionCookie: vi.fn(),
  getUser: vi.fn(),
  createSessionCookie: vi.fn(),
  revokeRefreshTokens: vi.fn(),
}));
// Only the external Admin SDK is faked. SQL/migrations come from the embedded transport.
vi.mock(
  "../artifacts/api-server/node_modules/firebase-admin/lib/esm/app/index.js",
  () => ({
    applicationDefault: () => ({}),
    getApps: () => [],
    initializeApp: (options: unknown) => ({ options }),
  }),
);
vi.mock(
  "../artifacts/api-server/node_modules/firebase-admin/lib/esm/auth/index.js",
  () => ({ getAuth: () => sdk }),
);
import { pool } from "@workspace/db";
import authRouter from "../artifacts/api-server/src/routes/auth";
import { logger } from "../artifacts/api-server/src/lib/logger";
import { errorHandler } from "../artifacts/api-server/src/middlewares/error-handler";
import {
  CSRF_COOKIE,
  DEVICE_COOKIE,
  SESSION_COOKIE,
} from "../artifacts/api-server/src/services/auth-sessions";
import {
  signedNonce,
  digest,
  unseal,
} from "../artifacts/api-server/src/lib/auth-crypto";

const origin = "https://proofstack.example.test";
function app() {
  return express()
    .use((req, _res, next) => {
      req.id = randomUUID();
      req.log = logger;
      next();
    })
    .use(express.json())
    .use(cookieParser())
    .use("/api", authRouter)
    .use(errorHandler);
}
function browser() {
  const csrf = signedNonce();
  const device = signedNonce();
  return {
    csrf,
    device,
    cookies: [`${CSRF_COOKIE}=${csrf}`, `${DEVICE_COOKIE}=${device}`],
  };
}
function native(uid = randomUUID(), mfa = false) {
  const now = Math.floor(Date.now() / 1000);
  const decoded = {
    uid,
    sub: uid,
    aud: "proofstack-test",
    iss: "https://securetoken.google.com/proofstack-test",
    iat: now,
    exp: now + 3600,
    auth_time: now - 20,
    email: `${uid}@example.test`,
    email_verified: true,
    firebase: {
      sign_in_provider: "google.com",
      identities: { "google.com": [uid] },
      ...(mfa
        ? {
            sign_in_second_factor: "totp",
            second_factor_identifier: "native-factor",
          }
        : {}),
    },
  };
  sdk.verifyIdToken.mockResolvedValue(decoded);
  sdk.verifySessionCookie.mockResolvedValue({
    ...decoded,
    iss: "https://session.firebase.google.com/proofstack-test",
  });
  sdk.getUser.mockResolvedValue({
    uid,
    disabled: false,
    email: decoded.email,
    emailVerified: true,
    displayName: "HTTP account",
    multiFactor: {
      enrolledFactors: mfa
        ? [
            {
              uid: "native-factor",
              factorId: "totp",
              displayName: "Authenticator",
            },
          ]
        : [],
    },
  });
  sdk.createSessionCookie.mockResolvedValue(`native-session-${uid}`);
  sdk.revokeRefreshTokens.mockResolvedValue(undefined);
  return { uid, idToken: `signed-test-token-${randomUUID()}` };
}
async function login(b = browser(), idToken = native().idToken) {
  const response = await supertest(app())
    .post("/api/auth/firebase/session")
    .set("Origin", origin)
    .set("Cookie", b.cookies)
    .set("X-CSRF-Token", b.csrf)
    .send({ idToken });
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  expect(response.body).toEqual({ signedIn: true });
  const setCookies = response.headers["set-cookie"] as unknown as string[];
  const session = setCookies.find((value) =>
    value.startsWith(`${SESSION_COOKIE}=`),
  )!;
  expect(session).toContain("HttpOnly");
  expect(session).toContain("Secure");
  expect(session).toContain("Path=/");
  const handle = session.split(";")[0].slice(SESSION_COOKIE.length + 1);
  const cookies = [...b.cookies, session.split(";")[0]];
  // New accounts confirm their age and accept the terms before using the API.
  const agreed = await supertest(app())
    .post("/api/auth/action")
    .set("Origin", origin)
    .set("Cookie", cookies)
    .set("X-CSRF-Token", b.csrf)
    .send({
      action: "accept-terms",
      birthDate: "1990-01-01",
      acceptTerms: true,
    });
  expect(agreed.status, JSON.stringify(agreed.body)).toBe(200);
  return { ...b, handle, cookies };
}
beforeEach(async () => {
  for (const [name, value] of Object.entries({
    AUTH_PROVIDER: "firebase",
    AUTH_APP_ORIGIN: origin,
    SESSION_SECRET: "http-test-only-session-key-at-least-32-characters",
    FIREBASE_PROJECT_ID: "proofstack-test",
    FIREBASE_WEB_PROJECT_ID: "proofstack-test",
    FIREBASE_WEB_API_KEY: "public-test-key",
    FIREBASE_WEB_AUTH_DOMAIN: "proofstack-test.firebaseapp.com",
    FIREBASE_WEB_APP_ID: "test-web-app",
    FIREBASE_GOOGLE_ENABLED: "true",
    FIREBASE_GITHUB_ENABLED: "true",
    FIREBASE_WEB_CONFIG_FILE: "",
  }))
    vi.stubEnv(name, value);
  vi.clearAllMocks();
  await pool.query("DELETE FROM rate_limit_buckets");
});
afterEach(() => vi.unstubAllEnvs());

describe("Firebase HTTP authentication with real SQL", () => {
  it.each([
    {},
    null,
    [],
    { idToken: 42 },
    { idToken: "" },
    { idToken: " padded " },
    { idToken: "embedded space" },
    { idToken: "x".repeat(16_385) },
    { idToken: "token", role: "admin" },
    { idToken: "token", refreshToken: "untrusted" },
  ])(
    "rejects malformed or extra token body fields before native I/O (%#)",
    async (body) => {
      native();
      const b = browser();
      const response = await supertest(app())
        .post("/api/auth/firebase/session")
        .set("Origin", origin)
        .set("Cookie", b.cookies)
        .set("X-CSRF-Token", b.csrf)
        .set("Content-Type", "application/json")
        .send(body === null ? "null" : body);
      expect(response.status).toBe(400);
      expect(sdk.verifyIdToken).not.toHaveBeenCalled();
    },
  );
  it.each([
    "wrong-origin",
    "missing-origin",
    "missing-csrf",
    "wrong-csrf",
    "forged-cookie",
  ])("rejects %s before the provider boundary", async (mode) => {
    native();
    const b = browser();
    let request = supertest(app())
      .post("/api/auth/firebase/session")
      .set(
        "Cookie",
        mode === "forged-cookie"
          ? [`${CSRF_COOKIE}=forged`, `${DEVICE_COOKIE}=${b.device}`]
          : b.cookies,
      );
    if (mode !== "missing-origin")
      request = request.set(
        "Origin",
        mode === "wrong-origin" ? "https://attacker.example.test" : origin,
      );
    if (mode !== "missing-csrf")
      request = request.set(
        "X-CSRF-Token",
        mode === "wrong-csrf" ? "wrong" : b.csrf,
      );
    expect((await request.send({ idToken: "test-token" })).status).toBe(403);
    expect(sdk.verifyIdToken).not.toHaveBeenCalled();
  });
  it("applies a real persistent IP rate budget before token verification", async () => {
    native();
    const b = browser();
    sdk.verifyIdToken.mockRejectedValue({
      code: "auth/invalid-id-token",
      message: "must-not-leak-native-message",
    });
    for (let attempt = 0; attempt < 11; attempt++) {
      const response = await supertest(app())
        .post("/api/auth/firebase/session")
        .set("Origin", origin)
        .set("Cookie", b.cookies)
        .set("X-CSRF-Token", b.csrf)
        .send({ idToken: `bad-token-${attempt}` });
      expect(response.status).toBe(attempt === 10 ? 429 : 401);
      expect(JSON.stringify(response.body)).not.toContain(
        "must-not-leak-native-message",
      );
    }
    expect(sdk.verifyIdToken).toHaveBeenCalledTimes(10);
  });
  it("rejects Firebase exchange in Supabase mode without fallback", async () => {
    native();
    const b = browser();
    vi.stubEnv("AUTH_PROVIDER", "supabase");
    const response = await supertest(app())
      .post("/api/auth/firebase/session")
      .set("Origin", origin)
      .set("Cookie", b.cookies)
      .set("X-CSRF-Token", b.csrf)
      .send({ idToken: "test-token" });
    expect(response.status).toBe(409);
    expect(sdk.verifyIdToken).not.toHaveBeenCalled();
  });
  it("revokes an individual Firebase device through the common database-only action", async () => {
    const b = await login();
    const row = (
      await pool.query("SELECT * FROM sessions WHERE handle_hash=$1", [
        digest(b.handle),
      ])
    ).rows[0];
    const response = await supertest(app())
      .post("/api/auth/action")
      .set("Origin", origin)
      .set("Cookie", b.cookies)
      .set("X-CSRF-Token", b.csrf)
      .send({ action: "revoke-session", sessionId: row.id });
    expect(response.status).toBe(200);
    expect(response.body.signedOut).toBe(true);
    expect(
      (await pool.query("SELECT * FROM sessions WHERE id=$1", [row.id])).rows[0]
        .encrypted_credentials,
    ).toBeNull();
    expect(sdk.revokeRefreshTokens).not.toHaveBeenCalled();
  });
  it("retains native MFA-gated database-only organization creation", async () => {
    const issued = native(randomUUID(), true);
    const b = await login(browser(), issued.idToken);
    const slug = `http-org-${randomUUID()}`;
    const response = await supertest(app())
      .post("/api/auth/action")
      .set("Origin", origin)
      .set("Cookie", b.cookies)
      .set("X-CSRF-Token", b.csrf)
      .send({
        action: "create-organization",
        name: "Native verified organization",
        slug,
      });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    const grant = await pool.query(
      "SELECT r.key FROM organizations o JOIN organization_members m ON m.organization_id=o.id JOIN roles r ON r.id=m.role_id WHERE o.slug=$1",
      [slug],
    );
    expect(grant.rows).toEqual([{ key: "organization_owner" }]);
  });
  it("revokes local credentials and clears cookies even if Firebase global revocation fails", async () => {
    const b = await login();
    sdk.revokeRefreshTokens.mockRejectedValueOnce({
      code: "auth/internal-error",
      message: "private-native-details",
    });
    const response = await supertest(app())
      .post("/api/auth/action")
      .set("Origin", origin)
      .set("Cookie", b.cookies)
      .set("X-CSRF-Token", b.csrf)
      .send({ action: "logout", scope: "global" });
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe("FIREBASE_UNAVAILABLE");
    expect(JSON.stringify(response.body)).not.toContain(
      "private-native-details",
    );
    expect(
      (response.headers["set-cookie"] as unknown as string[]).some((cookie) =>
        cookie.startsWith(`${SESSION_COOKIE}=;`),
      ),
    ).toBe(true);
    expect(
      (
        await pool.query("SELECT * FROM sessions WHERE handle_hash=$1", [
          digest(b.handle),
        ])
      ).rows[0].encrypted_credentials,
    ).toBeNull();
  });
  it("marks organization role assignment pending rather than checking targets through Supabase", async () => {
    const b = await login();
    const response = await supertest(app())
      .post("/api/auth/action")
      .set("Origin", origin)
      .set("Cookie", b.cookies)
      .set("X-CSRF-Token", b.csrf)
      .send({
        action: "organization-role",
        organizationId: randomUUID(),
        userId: randomUUID(),
        role: "organization_admin",
      });
    expect(response.status, JSON.stringify(response.body)).toBe(409);
    expect(response.body.error.code).toBe("AUTH_METHOD_UNAVAILABLE");
  });
  it.each(["local", "global"] as const)(
    "logs out %s Firebase sessions without calling Supabase",
    async (scope) => {
      const issued = native();
      const first = await login(browser(), issued.idToken);
      const second = await login(browser(), `second-token-${randomUUID()}`);
      const response = await supertest(app())
        .post("/api/auth/action")
        .set("Origin", origin)
        .set("Cookie", first.cookies)
        .set("X-CSRF-Token", first.csrf)
        .send({ action: "logout", scope });
      expect(response.status, JSON.stringify(response.body)).toBe(200);
      expect(response.body.signedOut).toBe(true);
      const rows = (
        await pool.query(
          "SELECT * FROM sessions WHERE handle_hash=ANY($1::text[]) ORDER BY handle_hash",
          [[digest(first.handle), digest(second.handle)]],
        )
      ).rows;
      expect(
        rows.find((row) => row.handle_hash === digest(first.handle))
          .encrypted_credentials,
      ).toBeNull();
      expect(
        rows.find((row) => row.handle_hash === digest(second.handle))
          .revoked_at === null,
      ).toBe(scope === "local");
      if (scope === "global")
        expect(sdk.revokeRefreshTokens).toHaveBeenCalledWith(issued.uid);
      else expect(sdk.revokeRefreshTokens).not.toHaveBeenCalled();
      const resume = await supertest(app())
        .get("/api/auth/context")
        .set("Cookie", first.cookies);
      expect(resume.body.authenticated).toBe(false);
    },
  );
  it.each([
    { action: "mfa-enroll", factorType: "totp" },
    { action: "mfa-challenge", factorId: randomUUID() },
    { action: "mfa-verify", factorId: randomUUID(), code: "123456" },
    { action: "mfa-remove", factorId: randomUUID() },
    { action: "recovery-codes" },
    {
      action: "recover-mfa",
      code: "test-only-recovery-code-with-32-characters",
    },
    { action: "oauth", provider: "google" },
    {
      action: "password-login",
      email: "test@example.test",
      password: "test-password",
    },
    { action: "password-reset", email: "test@example.test" },
    { action: "email-otp", email: "test@example.test" },
    { action: "phone-otp", phone: "+15551234567" },
    { action: "update-password", password: "test-only-valid-password" },
    { action: "send-phone-verification", phone: "+15551234567" },
  ])(
    "fails closed with explicit pending status for unsupported $action",
    async (input) => {
      const b = await login();
      const response = await supertest(app())
        .post("/api/auth/action")
        .set("Origin", origin)
        .set("Cookie", b.cookies)
        .set("X-CSRF-Token", b.csrf)
        .send(input);
      expect(response.status, JSON.stringify(response.body)).toBe(409);
      expect(response.body.error.code).toBe("AUTH_METHOD_UNAVAILABLE");
      const row = (
        await pool.query("SELECT * FROM sessions WHERE handle_hash=$1", [
          digest(b.handle),
        ])
      ).rows[0];
      expect(row.revoked_at).toBeNull();
    },
  );
  it("resumes through common context/account and retains database-only profile actions", async () => {
    const b = await login();
    const context = await supertest(app())
      .get("/api/auth/context")
      .set("Cookie", b.cookies);
    expect(context.status, JSON.stringify(context.body)).toBe(200);
    expect(context.body).toMatchObject({
      authenticated: true,
      mfaRequired: false,
      user: { displayName: "HTTP account" },
    });
    const account = await supertest(app())
      .get("/api/auth/account")
      .set("Cookie", b.cookies);
    expect(account.status).toBe(200);
    expect(account.body.sessions).toEqual([
      expect.objectContaining({ current: true }),
    ]);
    const updated = await supertest(app())
      .post("/api/auth/action")
      .set("Origin", origin)
      .set("Cookie", b.cookies)
      .set("X-CSRF-Token", b.csrf)
      .send({
        action: "update-profile",
        displayName: "New display",
        kind: "developer",
      });
    expect(updated.status).toBe(200);
    const reread = await supertest(app())
      .get("/api/auth/account")
      .set("Cookie", b.cookies);
    expect(reread.body.user.displayName).toBe("New display");
    expect(JSON.stringify(reread.body)).not.toContain("native-session-");
  });
  it("exchanges a verified native ID token for an opaque encrypted application session", async () => {
    const issued = native();
    const b = await login(browser(), issued.idToken);
    const row = (
      await pool.query("SELECT * FROM sessions WHERE handle_hash=$1", [
        digest(b.handle),
      ])
    ).rows[0];
    expect(b.handle).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(unseal(row.encrypted_credentials)).toEqual({
      provider: "firebase",
      sessionCookie: `native-session-${issued.uid}`,
    });
    expect(row.device_hash).toBe(digest(b.device, "device"));
    expect(sdk.verifyIdToken).toHaveBeenCalledWith(issued.idToken, true);
    expect(sdk.verifySessionCookie).toHaveBeenCalledWith(
      `native-session-${issued.uid}`,
      true,
    );
  });
});
