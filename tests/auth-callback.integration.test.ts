import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import express from "express";
import supertest from "supertest";
import { pool } from "@workspace/db";
import authRouter from "../artifacts/api-server/src/routes/auth";
import { createFlow } from "../artifacts/api-server/src/services/auth-flows";
import {
  CSRF_COOKIE,
  DEVICE_COOKIE,
  FLOW_COOKIE,
  SESSION_COOKIE,
} from "../artifacts/api-server/src/services/auth-sessions";
import {
  digest,
  signedNonce,
} from "../artifacts/api-server/src/lib/auth-crypto";

const require = createRequire(
  new URL("../artifacts/api-server/package.json", import.meta.url),
);
const cookieParser: () => express.RequestHandler = require("cookie-parser");
beforeEach(() => {
  for (const [name, value] of Object.entries({
    AUTH_PROVIDER: "supabase",
    AUTH_APP_ORIGIN: "https://proofstack.example.test",
    SESSION_SECRET: "callback-test-only-key-at-least-32-characters",
    SUPABASE_URL: "https://callback-test.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "public-test-key",
    SUPABASE_SECRET_KEY: "test-server-only-key",
  }))
    vi.stubEnv(name, value);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
function app() {
  return express()
    .use(cookieParser())
    .use((req, _res, next) => {
      req.id = randomUUID();
      next();
    })
    .use("/api", authRouter);
}
it("returns the verified legacy callback to the auth UI without trusting query destinations", async () => {
  const uid = randomUUID();
  const nativeSession = randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const user = {
    id: uid,
    aud: "authenticated",
    email: `${uid}@example.test`,
    email_confirmed_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    app_metadata: {},
    user_metadata: {},
    factors: [],
  };
  const access = `header.${Buffer.from(JSON.stringify({ sub: uid, session_id: nativeSession, exp: now + 3600, aal: "aal1" })).toString("base64url")}.test-signature`;
  // Fake only external HTTP; the real Supabase SDK, flow persistence, crypto and SQL run.
  const fetch = vi.fn(
    async (
      input: Parameters<typeof globalThis.fetch>[0],
      init?: RequestInit,
    ) => {
      const url = String(input);
      if (url.startsWith("https://callback-test.supabase.co/auth/v1/token?")) {
        expect(JSON.parse(String(init?.body))).toMatchObject({
          auth_code: "provider-code",
          code_verifier: "test-pkce-verifier",
        });
        return new Response(
          JSON.stringify({
            access_token: access,
            refresh_token: "test-refresh-token",
            expires_in: 3600,
            token_type: "bearer",
            user,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url === "https://callback-test.supabase.co/auth/v1/user") {
        return new Response(JSON.stringify(user), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw new Error(`Unexpected provider URL: ${url}`);
    },
  );
  vi.stubGlobal("fetch", fetch);
  const csrf = signedNonce();
  const req = {
    cookies: { [CSRF_COOKIE]: csrf },
  } as unknown as express.Request;
  const res = { cookie: vi.fn() } as unknown as express.Response;
  const handle = await createFlow(req, res, {
    type: "oauth",
    storage: {
      "sb-callback-test-auth-token-code-verifier":
        JSON.stringify("test-pkce-verifier"),
    },
  });
  const response = await supertest(app())
    .get(
      "/api/auth/callback?code=provider-code&next=https://attacker.example.test",
    )
    .set("Cookie", [
      `${FLOW_COOKIE}=${handle}`,
      `${CSRF_COOKIE}=${csrf}`,
      `${DEVICE_COOKIE}=${signedNonce()}`,
    ]);
  expect(response.status).toBe(200);
  expect(response.headers.location).toBeUndefined();
  expect(response.text).toContain('content="0;url=/auth"');
  expect(
    (response.headers["set-cookie"] as unknown as string[]).some((cookie) =>
      cookie.startsWith(`${SESSION_COOKIE}=`),
    ),
  ).toBe(true);
  expect(
    (
      await pool.query("SELECT * FROM auth_flows WHERE handle_hash=$1", [
        digest(handle, "flow"),
      ])
    ).rows,
  ).toHaveLength(0);
  expect(
    (await pool.query("SELECT * FROM users WHERE auth_subject=$1", [uid])).rows,
  ).toHaveLength(1);
});
it("retains the safe failed callback navigation", async () => {
  const response = await supertest(app()).get(
    "/api/auth/callback?code=bad&next=//attacker.example.test",
  );
  expect(response.status).toBe(200);
  expect(response.headers.location).toBeUndefined();
  expect(response.headers["referrer-policy"]).toBe("no-referrer");
  expect(response.text).toContain(
    'content="0;url=/auth?error=callback_failed"',
  );
  expect(response.text).not.toContain("attacker");
});
// The web tier's fetch proxy follows redirects, so the API must not issue them.
it("issues no HTTP redirects from the API", async () => {
  const { readdirSync, readFileSync } = await import("node:fs");
  const root = new URL("../artifacts/api-server/src/", import.meta.url);
  const files = readdirSync(root, { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".ts"))
    .filter((file) =>
      /\bres\.redirect\(/.test(readFileSync(new URL(file, root), "utf8")),
    );
  expect(files).toEqual([]);
});
