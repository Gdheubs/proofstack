import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { randomUUID } from "node:crypto";

const store = vi.hoisted(() => ({ close: async () => {} }));

// Replace only the database transport: execute real PostgreSQL SQL in WASM,
// applying the tracked migrations rather than simulating tables in a mock.
vi.mock("@workspace/db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { readFile } = await import("node:fs/promises");
  const database = await PGlite.create();
  const folder = new URL("../lib/db/drizzle/", import.meta.url);
  const journal = JSON.parse(
    await readFile(new URL("meta/_journal.json", folder), "utf8"),
  );
  for (const entry of journal.entries) {
    await database.exec(
      await readFile(new URL(`${entry.tag}.sql`, folder), "utf8"),
    );
  }
  store.close = () => database.close();
  const query = (text: string, values: unknown[] = []) =>
    database.query(text, values);
  return {
    pool: {
      query,
      connect: async () => ({ query, release() {} }),
    },
  };
});

import type { Request, Response } from "express";
import { pool } from "@workspace/db";
import {
  digest,
  opaqueHandle,
} from "../artifacts/api-server/src/lib/auth-crypto";
import {
  authLimit,
  checkLock,
  clearFailures,
  failedAttempt,
} from "../artifacts/api-server/src/services/auth-limits";
import {
  apiRateLimit,
  SHARED_NETWORK_CEILING,
} from "../artifacts/api-server/src/middlewares/rate-limit";
import { env } from "../artifacts/api-server/src/lib/env";
import {
  listUsers,
  maskEmail,
} from "../artifacts/api-server/src/services/auth-account";
import { CommunityReader } from "../artifacts/api-server/src/services/community-reader";
import type { AuthSession } from "../artifacts/api-server/src/services/auth-sessions";

const fromNetwork = (ip: string) =>
  ({ ip, id: randomUUID(), headers: {} }) as unknown as Request;
const email = "victim@example.test";

beforeEach(async () => {
  vi.stubEnv("SESSION_SECRET", "account-protection-key-at-least-32-chars");
  await pool.query("TRUNCATE rate_limit_buckets, auth_failures");
});
afterEach(() => vi.unstubAllEnvs());
afterAll(async () => store.close());

describe("account lockout cannot be triggered by someone else", () => {
  it("locks only the network that made the failed attempts", async () => {
    const attacker = fromNetwork("198.51.100.7");
    const owner = fromNetwork("203.0.113.9");
    for (let i = 0; i < 5; i++) await failedAttempt(attacker, email);
    await expect(checkLock(attacker, email)).rejects.toMatchObject({
      code: "ACCOUNT_TEMPORARILY_LOCKED",
    });
    await expect(checkLock(owner, email)).resolves.toBeUndefined();
    await clearFailures(owner, email);
    await expect(checkLock(attacker, email)).rejects.toMatchObject({
      code: "ACCOUNT_TEMPORARILY_LOCKED",
    });
  });

  it("keeps the owner's guessing budget while capping the account overall", async () => {
    const attacker = fromNetwork("198.51.100.8");
    for (let i = 0; i < 10; i++)
      await authLimit(attacker, "password-login", email, 10, 900, true);
    await expect(
      authLimit(attacker, "password-login", email, 10, 900, true),
    ).rejects.toMatchObject({ code: "AUTH_RATE_LIMITED" });
    await expect(
      authLimit(
        fromNetwork("203.0.113.10"),
        "password-login",
        email,
        10,
        900,
        true,
      ),
    ).resolves.toBeUndefined();
    // Many networks together still hit the account-wide ceiling (5x).
    for (let n = 0; n < 39; n++)
      await authLimit(
        fromNetwork(`192.0.2.${n + 1}`),
        "password-login",
        email,
        10,
        900,
        true,
      );
    await expect(
      authLimit(
        fromNetwork("192.0.2.200"),
        "password-login",
        email,
        10,
        900,
        true,
      ),
    ).rejects.toMatchObject({ code: "AUTH_RATE_LIMITED" });
  });
});

describe("signed-in users behind a shared address", () => {
  const call = async (req: Request) => {
    let error: unknown;
    const res = { setHeader() {} } as unknown as Response;
    await apiRateLimit(req, res, (e?: unknown) => {
      error = e;
    });
    return error as { status?: number } | undefined;
  };
  const request = (cookie?: string) =>
    ({
      path: "/community",
      ip: "100.64.0.1",
      headers: cookie ? { cookie } : {},
    }) as unknown as Request;

  it("counts a live session against its account once the address allowance is used", async () => {
    const user = randomUUID();
    const handle = opaqueHandle();
    await pool.query(
      "INSERT INTO users(id,auth_subject,email) VALUES($1,$2,$3)",
      [user, user, `${user}@example.test`],
    );
    await pool.query(
      "INSERT INTO sessions(user_id,provider_session_id,handle_hash,expires_at,encrypted_credentials) VALUES($1,$2,$3,now()+interval '1 hour','fixture')",
      [user, randomUUID(), digest(handle)],
    );
    for (let i = 0; i < env.RATE_LIMIT_MAX; i++)
      expect(await call(request())).toBeUndefined();
    expect((await call(request()))?.status).toBe(429);
    expect(
      (await call(request(`__Host-ps-session=${opaqueHandle()}`)))?.status,
    ).toBe(429);
    const signedIn = request(`theme=dark; __Host-ps-session=${handle}`);
    expect(await call(signedIn)).toBeUndefined();
    await pool.query(
      "UPDATE rate_limit_buckets SET hits=$1 WHERE key LIKE 'api:account:%'",
      [env.RATE_LIMIT_MAX],
    );
    expect((await call(signedIn))?.status).toBe(429);
    await pool.query(
      "UPDATE rate_limit_buckets SET hits=0 WHERE key LIKE 'api:account:%'",
    );
    await pool.query(
      "UPDATE rate_limit_buckets SET hits=$1 WHERE key NOT LIKE 'api:account:%'",
      [env.RATE_LIMIT_MAX * SHARED_NETWORK_CEILING],
    );
    expect((await call(signedIn))?.status).toBe(429);
  });
});

describe("contact details and pending invitations", () => {
  it("masks email and hides phone numbers from moderators", async () => {
    expect(maskEmail("person@example.test")).toBe("p***@example.test");
    const user = randomUUID();
    await pool.query(
      "INSERT INTO users(id,auth_subject,email,phone) VALUES($1,$2,'person@example.test','+919999999999')",
      [user, user],
    );
    await pool.query(
      "INSERT INTO profiles(user_id,display_name) VALUES($1,'Person')",
      [user],
    );
    const as = (platformRole: string) =>
      ({
        user: { id: randomUUID(), platformRole },
        aal: "aal2",
        row: { last_mfa_at: new Date() },
        providerUser: {
          factors: [{ status: "verified", factor_type: "totp" }],
        },
      }) as unknown as AuthSession;
    const moderator = (await listUsers(as("moderator"))).find(
      (u) => u.id === user,
    );
    expect(moderator).toMatchObject({
      email: "p***@example.test",
      phone: null,
    });
    const admin = (await listUsers(as("admin"))).find((u) => u.id === user);
    expect(admin).toMatchObject({
      email: "person@example.test",
      phone: "+919999999999",
    });
  });

  it("shows pending project invitations only to editors and the invitee", async () => {
    const [owner, invitee, other] = [randomUUID(), randomUUID(), randomUUID()];
    const project = randomUUID();
    await pool.query(
      "INSERT INTO users(id,auth_subject,email) SELECT id,id::text,id::text||'@example.test' FROM unnest($1::uuid[]) ids(id)",
      [[owner, invitee, other]],
    );
    await pool.query(
      "INSERT INTO profiles(user_id,display_name,handle) SELECT id,'Person','p'||left(replace(id::text,'-',''),12) FROM unnest($1::uuid[]) ids(id)",
      [[owner, invitee, other]],
    );
    await pool.query(
      "INSERT INTO community_projects(id,owner_id,slug,title,description) VALUES($1,$2,$3,'Public project','Fixture')",
      [project, owner, project],
    );
    await pool.query(
      "INSERT INTO community_contributors(project_id,user_id,status) VALUES($1,$2,'pending')",
      [project, invitee],
    );
    const seen = async (viewer: string | null) =>
      (
        await new CommunityReader(viewer).projects("p.id=$2", [project])
      )[0]!.contributors.map((c) => c.person.id);
    expect(await seen(null)).toEqual([]);
    expect(await seen(other)).toEqual([]);
    expect(await seen(owner)).toEqual([invitee]);
    expect(await seen(invitee)).toEqual([invitee]);
  });
});
