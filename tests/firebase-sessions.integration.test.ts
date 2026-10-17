import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { FirebasePrincipal } from "../artifacts/api-server/src/services/firebase-provider";

const boundary = vi.hoisted(() => ({
  close: async () => {},
  depth: 0,
  verifyIdToken: vi.fn(),
  createSessionCookie: vi.fn(),
  verifySessionCookie: vi.fn(),
}));
// Only replace the DB transport: all identity/session/audit SQL and migrations are real PostgreSQL.
vi.mock("@workspace/db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { readFile } = await import("node:fs/promises");
  const db = await PGlite.create();
  const folder = new URL("../lib/db/drizzle/", import.meta.url);
  const journal = JSON.parse(
    await readFile(new URL("meta/_journal.json", folder), "utf8"),
  );
  for (const entry of journal.entries)
    await db.exec(await readFile(new URL(`${entry.tag}.sql`, folder), "utf8"));
  boundary.close = () => db.close();
  const query = async (text: string, values: unknown[] = []) => {
    const result = await db.query(text, values);
    if (text === "BEGIN") boundary.depth++;
    if (text === "COMMIT" || text === "ROLLBACK") boundary.depth--;
    return result;
  };
  return { pool: { query, connect: async () => ({ query, release() {} }) } };
});
// External Firebase is the sole identity boundary fake; application helpers are never mocked.
vi.mock("../artifacts/api-server/src/services/firebase-provider", () => ({
  createFirebaseProvider: () => ({
    verifyIdToken: boundary.verifyIdToken,
    createSessionCookie: boundary.createSessionCookie,
    verifySessionCookie: boundary.verifySessionCookie,
  }),
}));
import { pool } from "@workspace/db";
import {
  digest,
  signedNonce,
  unseal,
  seal,
} from "../artifacts/api-server/src/lib/auth-crypto";
import { ApiError } from "../artifacts/api-server/src/lib/errors";
import {
  DEVICE_COOKIE,
  SESSION_COOKIE,
  readSession,
} from "../artifacts/api-server/src/services/auth-sessions";

async function feature() {
  return import("../artifacts/api-server/src/services/firebase-sessions");
}
function principal(
  overrides: Partial<FirebasePrincipal> = {},
): FirebasePrincipal {
  const uid = `standard/non-uuid:${randomUUID()}`;
  return {
    provider: "firebase",
    projectId: "proofstack-test",
    uid,
    subject: `firebase:proofstack-test:${encodeURIComponent(uid)}`,
    email: `${randomUUID()}@example.test`,
    phoneNumber: null,
    displayName: "Native verified account",
    nativeFactors: [],
    assurance: "aal1",
    authTime: Math.floor(Date.now() / 1000) - 60,
    ...overrides,
  };
}
function native(identity = principal()) {
  const idToken = `id-token-${randomUUID()}`;
  const credentials = {
    provider: "firebase" as const,
    sessionCookie: `native-cookie-${randomUUID()}`,
  };
  const checked = { decoded: {}, principal: identity };
  boundary.verifyIdToken.mockImplementation(async () => {
    expect(boundary.depth).toBe(0);
    return checked;
  });
  boundary.createSessionCookie.mockImplementation(async () => {
    expect(boundary.depth).toBe(0);
    return { ...checked, credentials };
  });
  boundary.verifySessionCookie.mockImplementation(async () => {
    expect(boundary.depth).toBe(0);
    return checked;
  });
  return { idToken, credentials, identity };
}
function browser() {
  const req = {
    id: randomUUID(),
    cookies: { [DEVICE_COOKIE]: signedNonce() } as Record<string, string>,
    get: (name: string) =>
      name.toLowerCase() === "user-agent" ? "Chrome/ Windows" : undefined,
  } as unknown as import("express").Request;
  const res = {
    locals: {} as Record<string, unknown>,
    cookie: vi.fn((name: string, value: string) => {
      req.cookies[name] = value;
    }),
    clearCookie: vi.fn(),
  } as unknown as import("express").Response;
  return { req, res };
}
async function sessionRow(handle: string) {
  return (
    await pool.query("SELECT * FROM sessions WHERE handle_hash=$1", [
      digest(handle),
    ])
  ).rows[0];
}
beforeEach(() => {
  process.env.AUTH_PROVIDER = "firebase";
  process.env.SESSION_SECRET =
    "firebase-session-test-key-at-least-32-characters";
  boundary.verifyIdToken.mockReset();
  boundary.createSessionCookie.mockReset();
  boundary.verifySessionCookie.mockReset();
});
afterAll(async () => boundary.close());

describe("Firebase application session persistence (real SQL)", () => {
  it.each(["active", "idle"])(
    "refuses a %s Firebase row in the common Supabase reader before native I/O and clears stale principal",
    async (state) => {
      const { createFirebaseAppSession } = await feature();
      const issued = native();
      const b = browser();
      await createFirebaseAppSession(b.req, b.res, issued.idToken);
      const row = await sessionRow(b.req.cookies[SESSION_COOKIE]);
      if (state === "idle")
        await pool.query(
          "UPDATE sessions SET last_seen_at=now()-interval '31 minutes' WHERE id=$1",
          [row.id],
        );
      process.env.AUTH_PROVIDER = "supabase";
      b.res.locals.principal = {
        userId: "stale",
        authSubject: "stale-subject",
      };
      await expect(readSession(b.req, b.res)).resolves.toBeNull();
      expect(boundary.verifySessionCookie).not.toHaveBeenCalled();
      expect(b.res.locals.principal).toBeUndefined();
      expect(
        (await sessionRow(b.req.cookies[SESSION_COOKIE])).encrypted_credentials,
      ).toBe(row.encrypted_credentials);
    },
  );
  it.each(["missing", "tampered", "different"])(
    "requires the %s device marker to match the keyed session binding",
    async (mode) => {
      const { createFirebaseAppSession, readFirebaseAppSession } =
        await feature();
      const issued = native();
      const b = browser();
      await createFirebaseAppSession(b.req, b.res, issued.idToken);
      const row = await sessionRow(b.req.cookies[SESSION_COOKIE]);
      if (mode === "missing") delete b.req.cookies[DEVICE_COOKIE];
      if (mode === "tampered") b.req.cookies[DEVICE_COOKIE] += "tampered";
      if (mode === "different") b.req.cookies[DEVICE_COOKIE] = signedNonce();
      await expect(readFirebaseAppSession(b.req, b.res)).resolves.toBeNull();
      expect(boundary.verifySessionCookie).not.toHaveBeenCalled();
      expect(b.res.locals.principal).toBeUndefined();
      // A stolen handle alone cannot revoke the legitimate browser's session.
      expect(
        (await sessionRow(b.req.cookies[SESSION_COOKIE])).encrypted_credentials,
      ).toBe(row.encrypted_credentials);
    },
  );
  it("rejects Firebase persistence and resume when Firebase is not the selected mode", async () => {
    const { createFirebaseAppSession, readFirebaseAppSession } =
      await feature();
    const issued = native();
    const b = browser();
    await createFirebaseAppSession(b.req, b.res, issued.idToken);
    const row = await sessionRow(b.req.cookies[SESSION_COOKIE]);
    process.env.AUTH_PROVIDER = "supabase";
    boundary.verifyIdToken.mockClear();
    boundary.createSessionCookie.mockClear();
    await expect(readFirebaseAppSession(b.req, b.res)).resolves.toBeNull();
    const retry = browser();
    await expect(
      createFirebaseAppSession(retry.req, retry.res, "fresh-other-token"),
    ).rejects.toMatchObject({ status: 409, code: "AUTH_METHOD_UNAVAILABLE" });
    expect(boundary.verifyIdToken).not.toHaveBeenCalled();
    expect(boundary.createSessionCookie).not.toHaveBeenCalled();
    expect(boundary.verifySessionCookie).not.toHaveBeenCalled();
    expect(
      (await sessionRow(b.req.cookies[SESSION_COOKIE])).encrypted_credentials,
    ).toBe(row.encrypted_credentials);
  });
  it.each(["supabase-credentials", "wrong-provider-row", "malformed-envelope"])(
    "rejects %s without fallback or sending it to Firebase",
    async (mode) => {
      const { createFirebaseAppSession, readFirebaseAppSession } =
        await feature();
      const issued = native();
      const b = browser();
      await createFirebaseAppSession(b.req, b.res, issued.idToken);
      const row = await sessionRow(b.req.cookies[SESSION_COOKIE]);
      if (mode === "supabase-credentials")
        await pool.query(
          "UPDATE sessions SET encrypted_credentials=$2 WHERE id=$1",
          [
            row.id,
            seal({
              access_token: "supabase-token",
              refresh_token: "supabase-refresh",
            }),
          ],
        );
      if (mode === "wrong-provider-row")
        await pool.query(
          "UPDATE sessions SET provider_session_id=$2 WHERE id=$1",
          [row.id, `supabase:${randomUUID()}`],
        );
      if (mode === "malformed-envelope")
        await pool.query(
          "UPDATE sessions SET encrypted_credentials='invalid.ciphertext.envelope' WHERE id=$1",
          [row.id],
        );
      await expect(readFirebaseAppSession(b.req, b.res)).resolves.toBeNull();
      expect(boundary.verifySessionCookie).not.toHaveBeenCalled();
      expect(b.res.locals.principal).toBeUndefined();
      const after = await sessionRow(b.req.cookies[SESSION_COOKIE]);
      if (mode === "wrong-provider-row")
        expect(after.encrypted_credentials).toBe(row.encrypted_credentials);
      else expect(after.encrypted_credentials).toBeNull();
    },
  );
  it.each(["subject", "auth-time"])(
    "rejects native %s substitution rather than hydrating another identity",
    async (reason) => {
      const { createFirebaseAppSession, readFirebaseAppSession } =
        await feature();
      const firstNative = native();
      const first = browser();
      await createFirebaseAppSession(first.req, first.res, firstNative.idToken);
      const firstRow = await sessionRow(first.req.cookies[SESSION_COOKIE]);
      const secondNative = native();
      const second = browser();
      await createFirebaseAppSession(
        second.req,
        second.res,
        secondNative.idToken,
      );
      const secondRow = await sessionRow(second.req.cookies[SESSION_COOKIE]);
      expect(secondRow.user_id).not.toBe(firstRow.user_id);
      const substitute =
        reason === "subject"
          ? secondNative.identity
          : {
              ...firstNative.identity,
              authTime: firstNative.identity.authTime + 30,
            };
      boundary.verifySessionCookie.mockResolvedValueOnce({
        decoded: {},
        principal: substitute,
      });
      await expect(
        readFirebaseAppSession(first.req, first.res),
      ).resolves.toBeNull();
      expect(first.res.locals.principal).toBeUndefined();
      expect(
        (await sessionRow(first.req.cookies[SESSION_COOKIE]))
          .encrypted_credentials,
      ).toBeNull();
      expect(
        (await sessionRow(second.req.cookies[SESSION_COOKIE])).revoked_at,
      ).toBeNull();
    },
  );
  it("re-evaluates active organization grants on every resume", async () => {
    const { createFirebaseAppSession, readFirebaseAppSession } =
      await feature();
    const issued = native();
    const b = browser();
    await createFirebaseAppSession(b.req, b.res, issued.idToken);
    const row = await sessionRow(b.req.cookies[SESSION_COOKIE]);
    const role = (
      await pool.query(
        "INSERT INTO roles(key,name) VALUES('organization_admin','Administrator') ON CONFLICT(key) DO UPDATE SET name=EXCLUDED.name RETURNING id",
      )
    ).rows[0];
    const org = (
      await pool.query(
        "INSERT INTO organizations(name,slug) VALUES('Session Test',$1) RETURNING id",
        [randomUUID()],
      )
    ).rows[0];
    await pool.query(
      "INSERT INTO organization_members(organization_id,user_id,role_id) VALUES($1,$2,$3)",
      [org.id, row.user_id, role.id],
    );
    expect(await readFirebaseAppSession(b.req, b.res)).toMatchObject({
      privileged: true,
      mfaRequired: true,
    });
    expect(b.res.locals.principal).toBeUndefined();
    await pool.query("DELETE FROM organization_members WHERE user_id=$1", [
      row.user_id,
    ]);
    expect(await readFirebaseAppSession(b.req, b.res)).toMatchObject({
      privileged: false,
      mfaRequired: false,
    });
    expect(b.res.locals.principal).toEqual({
      userId: row.user_id,
      authSubject: issued.identity.subject,
    });
  });
  it.each(["factor-aal1", "factor-aal2", "platform", "recovery"])(
    "enforces current native factors and SQL grants for %s before publishing principal",
    async (mode) => {
      const { createFirebaseAppSession, readFirebaseAppSession } =
        await feature();
      const issued = native(
        principal({
          assurance: mode === "factor-aal2" ? "aal2" : "aal1",
          nativeFactors: mode.startsWith("factor")
            ? [{ uid: "factor-id", factorId: "phone", displayName: "My phone" }]
            : [],
        }),
      );
      const b = browser();
      await createFirebaseAppSession(b.req, b.res, issued.idToken);
      const row = await sessionRow(b.req.cookies[SESSION_COOKIE]);
      if (mode === "platform")
        await pool.query("UPDATE users SET platform_role='admin' WHERE id=$1", [
          row.user_id,
        ]);
      if (mode === "recovery")
        await pool.query(
          "UPDATE users SET mfa_recovery_required=true WHERE id=$1",
          [row.user_id],
        );
      const result = await readFirebaseAppSession(b.req, b.res);
      expect(result?.mfaRequired).toBe(true);
      expect(result?.privileged).toBe(mode === "platform");
      if (mode === "factor-aal2")
        expect(b.res.locals.principal).toEqual({
          userId: row.user_id,
          authSubject: issued.identity.subject,
        });
      else expect(b.res.locals.principal).toBeUndefined();
      if (mode.startsWith("factor"))
        expect(result?.providerUser.factors).toEqual([
          expect.objectContaining({
            id: "factor-id",
            factor_type: "phone",
            status: "verified",
            friendly_name: "My phone",
          }),
        ]);
      expect(result?.row.last_mfa_at).toEqual(row.last_mfa_at);
    },
  );
  it.each([401, 503])(
    "fails closed on Firebase %s without treating outages as revocation",
    async (status) => {
      const { createFirebaseAppSession, readFirebaseAppSession } =
        await feature();
      const issued = native();
      const b = browser();
      await createFirebaseAppSession(b.req, b.res, issued.idToken);
      const initial = await sessionRow(b.req.cookies[SESSION_COOKIE]);
      b.res.locals.principal = {
        userId: "stale-principal",
        authSubject: "stale-subject",
      };
      boundary.verifySessionCookie.mockRejectedValueOnce(
        new ApiError(status, "FIREBASE_FAILED", "No credentials disclosed"),
      );
      if (status === 401)
        await expect(readFirebaseAppSession(b.req, b.res)).resolves.toBeNull();
      else
        await expect(
          readFirebaseAppSession(b.req, b.res),
        ).rejects.toMatchObject({ status: 503 });
      const after = await sessionRow(b.req.cookies[SESSION_COOKIE]);
      expect(b.res.locals.principal).toBeUndefined();
      if (status === 401) {
        expect(after.revoked_at).not.toBeNull();
        expect(after.encrypted_credentials).toBeNull();
        expect(b.res.clearCookie).toHaveBeenCalled();
      } else {
        expect(after.revoked_at).toBeNull();
        expect(after.encrypted_credentials).toBe(initial.encrypted_credentials);
        expect(after.last_seen_at).toEqual(initial.last_seen_at);
        expect(b.res.clearCookie).not.toHaveBeenCalled();
      }
    },
  );
  it.each(["revoked", "idle", "expired", "credentials", "handle"])(
    "rechecks %s changes after native I/O before touching the account",
    async (reason) => {
      const { createFirebaseAppSession, readFirebaseAppSession } =
        await feature();
      const issued = native();
      const b = browser();
      await createFirebaseAppSession(b.req, b.res, issued.idToken);
      const row = await sessionRow(b.req.cookies[SESSION_COOKIE]);
      const replacement = seal({
        provider: "firebase",
        sessionCookie: "replacement-native-cookie",
      });
      boundary.verifySessionCookie.mockImplementationOnce(async () => {
        expect(boundary.depth).toBe(0);
        if (reason === "revoked")
          await pool.query("UPDATE sessions SET revoked_at=now() WHERE id=$1", [
            row.id,
          ]);
        if (reason === "idle")
          await pool.query(
            "UPDATE sessions SET last_seen_at=now()-interval '31 minutes' WHERE id=$1",
            [row.id],
          );
        if (reason === "expired")
          await pool.query(
            "UPDATE sessions SET expires_at=now()-interval '1 second' WHERE id=$1",
            [row.id],
          );
        if (reason === "credentials")
          await pool.query(
            "UPDATE sessions SET encrypted_credentials=$2 WHERE id=$1",
            [row.id, replacement],
          );
        if (reason === "handle")
          await pool.query("UPDATE sessions SET handle_hash=$2 WHERE id=$1", [
            row.id,
            digest("replaced-handle"),
          ]);
        return {
          decoded: {},
          principal: {
            ...issued.identity,
            displayName: "Must not hydrate",
            email: `changed-${issued.identity.email}`,
          },
        };
      });
      await expect(readFirebaseAppSession(b.req, b.res)).resolves.toBeNull();
      const persisted = (
        await pool.query("SELECT * FROM sessions WHERE id=$1", [row.id])
      ).rows[0];
      if (reason === "credentials")
        expect(persisted.encrypted_credentials).toBe(replacement);
      if (reason === "idle")
        expect(new Date(persisted.last_seen_at).getTime()).toBeLessThan(
          Date.now() - 30 * 60000,
        );
      const user = (
        await pool.query("SELECT email FROM users WHERE id=$1", [row.user_id])
      ).rows[0];
      expect(user.email).toBe(issued.identity.email);
      expect(b.res.locals.principal).toBeUndefined();
    },
  );
  it.each(["local", "global", "idle", "expired"])(
    "refuses %s invalidation before contacting Firebase and destroys stored credentials",
    async (reason) => {
      const { createFirebaseAppSession, readFirebaseAppSession } =
        await feature();
      const issued = native();
      const b = browser();
      await createFirebaseAppSession(b.req, b.res, issued.idToken);
      const row = await sessionRow(b.req.cookies[SESSION_COOKIE]);
      if (reason === "local")
        await pool.query("UPDATE sessions SET revoked_at=now() WHERE id=$1", [
          row.id,
        ]);
      if (reason === "global")
        await pool.query(
          "UPDATE sessions SET revoked_at=now() WHERE user_id=$1",
          [row.user_id],
        );
      if (reason === "idle")
        await pool.query(
          "UPDATE sessions SET last_seen_at=now()-interval '31 minutes' WHERE id=$1",
          [row.id],
        );
      if (reason === "expired")
        await pool.query(
          "UPDATE sessions SET expires_at=now()-interval '1 second' WHERE id=$1",
          [row.id],
        );
      await expect(readFirebaseAppSession(b.req, b.res)).resolves.toBeNull();
      expect(boundary.verifySessionCookie).not.toHaveBeenCalled();
      const invalid = await sessionRow(b.req.cookies[SESSION_COOKIE]);
      expect(invalid.revoked_at).not.toBeNull();
      expect(invalid.encrypted_credentials).toBeNull();
      expect(b.res.clearCookie).toHaveBeenCalledWith(
        SESSION_COOKIE,
        expect.anything(),
      );
      expect(b.res.locals.principal).toBeUndefined();
    },
  );
  it("resumes the bound verified identity with a native check outside SQL locks", async () => {
    const { createFirebaseAppSession, readFirebaseAppSession } =
      await feature();
    const issued = native();
    const b = browser();
    await createFirebaseAppSession(b.req, b.res, issued.idToken);
    const row = await sessionRow(b.req.cookies[SESSION_COOKIE]);
    const resumed = await readFirebaseAppSession(b.req, b.res);
    expect(resumed).toMatchObject({
      provider: "firebase",
      client: null,
      credentials: issued.credentials,
      row: { id: row.id },
      user: { id: row.user_id },
      aal: "aal1",
      mfaRequired: false,
      privileged: false,
      firebase: {
        uid: issued.identity.uid,
        projectId: issued.identity.projectId,
      },
    });
    expect(resumed?.providerUser).toMatchObject({
      id: issued.identity.subject,
      email: issued.identity.email,
    });
    expect(b.res.locals.principal).toEqual({
      userId: row.user_id,
      authSubject: issued.identity.subject,
    });
    expect(boundary.verifySessionCookie).toHaveBeenCalledWith(
      issued.credentials,
    );
  });
  it("anchors freshness and expiration to native authentication, not cookie issue or factor enrollment", async () => {
    const { createFirebaseAppSession } = await feature();
    for (const assurance of ["aal1", "aal2"] as const) {
      const issued = native(
        principal({
          assurance,
          nativeFactors: [
            {
              uid: "factor-now",
              factorId: "totp",
              displayName: "Authenticator",
            },
          ],
        }),
      );
      const b = browser();
      await createFirebaseAppSession(b.req, b.res, issued.idToken);
      const row = await sessionRow(b.req.cookies[SESSION_COOKIE]);
      const authMs = issued.identity.authTime * 1000;
      expect(new Date(row.created_at).getTime()).toBe(authMs);
      expect(new Date(row.expires_at).getTime()).toBe(authMs + 7 * 86400000);
      expect(row.last_mfa_at ? new Date(row.last_mfa_at).getTime() : null).toBe(
        assurance === "aal2" ? authMs : null,
      );
    }
  });
  it("rejects verified-contact collisions without linking or changing the existing account", async () => {
    const { createFirebaseAppSession } = await feature();
    const firstNative = native();
    const first = browser();
    await createFirebaseAppSession(first.req, first.res, firstNative.idToken);
    const original = await sessionRow(first.req.cookies[SESSION_COOKIE]);
    const impostor = native(principal({ email: firstNative.identity.email }));
    const second = browser();
    await expect(
      createFirebaseAppSession(second.req, second.res, impostor.idToken),
    ).rejects.toMatchObject({
      status: 409,
      code: "AUTH_IDENTITY_LINK_REQUIRED",
    });
    expect(second.res.cookie).not.toHaveBeenCalled();
    expect(
      (
        await pool.query("SELECT auth_subject FROM users WHERE id=$1", [
          original.user_id,
        ])
      ).rows[0].auth_subject,
    ).toBe(firstNative.identity.subject);
    expect(
      (
        await pool.query("SELECT id FROM users WHERE auth_subject=$1", [
          impostor.identity.subject,
        ])
      ).rows,
    ).toHaveLength(0);
  });
  it("consumes each ID token once without reviving a locally revoked session", async () => {
    const { createFirebaseAppSession } = await feature();
    const issued = native();
    const first = browser();
    await createFirebaseAppSession(first.req, first.res, issued.idToken);
    const row = await sessionRow(first.req.cookies[SESSION_COOKIE]);
    await pool.query(
      "UPDATE sessions SET revoked_at=now(),encrypted_credentials=NULL WHERE id=$1",
      [row.id],
    );
    const retry = browser();
    await expect(
      createFirebaseAppSession(retry.req, retry.res, issued.idToken),
    ).rejects.toMatchObject({ status: 409, code: "SIGN_IN_REPLAY" });
    expect(
      (await sessionRow(first.req.cookies[SESSION_COOKIE])).revoked_at,
    ).not.toBeNull();
    expect(retry.res.cookie).not.toHaveBeenCalled();
    const count = await pool.query(
      "SELECT count(*)::integer AS count FROM sessions WHERE user_id=$1",
      [row.user_id],
    );
    expect(count.rows[0].count).toBe(1);
  });
  it("binds a non-UUID native identity to an opaque application cookie and encrypted credentials", async () => {
    const { createFirebaseAppSession } = await feature();
    const issued = native();
    const { req, res } = browser();
    await createFirebaseAppSession(req, res, issued.idToken);
    const handle = req.cookies[SESSION_COOKIE];
    expect(handle).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(handle).not.toBe(issued.credentials.sessionCookie);
    const row = await sessionRow(handle);
    expect(unseal(row.encrypted_credentials)).toEqual(issued.credentials);
    expect(row.encrypted_credentials).not.toContain(
      issued.credentials.sessionCookie,
    );
    expect(row.provider_session_id).toBe(
      `firebase:${digest(issued.idToken, "firebase-login")}`,
    );
    expect(row.device_hash).toBe(digest(req.cookies[DEVICE_COOKIE], "device"));
    const user = (
      await pool.query("SELECT * FROM users WHERE id=$1", [row.user_id])
    ).rows[0];
    expect(user.auth_subject).toBe(issued.identity.subject);
    expect(user.email).toBe(issued.identity.email);
    expect(boundary.createSessionCookie).toHaveBeenCalledWith(
      issued.idToken,
      7 * 86400000,
    );
    expect(res.cookie).toHaveBeenCalledWith(
      SESSION_COOKIE,
      handle,
      expect.objectContaining({ httpOnly: true, secure: true, path: "/" }),
    );
    const audit = await pool.query(
      "SELECT action,metadata FROM audit_logs WHERE actor_user_id=$1",
      [user.id],
    );
    expect(audit.rows).toEqual([
      expect.objectContaining({
        action: "auth.login_succeeded",
        metadata: { newDevice: false },
      }),
    ]);
    expect(JSON.stringify(audit.rows)).not.toContain(issued.idToken);
  });
});
