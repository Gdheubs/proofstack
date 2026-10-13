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
// applying the tracked migrations rather than simulating buckets in a mock.
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

import { pool } from "@workspace/db";
import { signedNonce } from "../artifacts/api-server/src/lib/auth-crypto";
import authRouter from "../artifacts/api-server/src/routes/auth";
import { runAction } from "../artifacts/api-server/src/services/auth-actions";
import { authLimit } from "../artifacts/api-server/src/services/auth-limits";
import * as identityProvider from "../artifacts/api-server/src/services/auth-provider";
import { CSRF_COOKIE } from "../artifacts/api-server/src/services/auth-sessions";

// Exercise the registered route handler with real CSRF, parsing, session lookup,
// and action dispatch. Anonymous logout fails after charging the action budget,
// so no provider or unrelated account mutation has to be faked.
const actionHandler = authRouter.stack.find(
  (layer) => layer.route?.path === "/auth/action",
)?.route?.stack[0].handle as (
  req: Parameters<typeof runAction>[0],
  res: Parameters<typeof runAction>[1],
) => Promise<void>;

function client(ip: string) {
  const token = signedNonce();
  return {
    ip,
    id: randomUUID(),
    body: { action: "logout", scope: "local" },
    cookies: { [CSRF_COOKIE]: token },
    get: (name: string) =>
      name.toLowerCase() === "origin"
        ? "https://proofstack.example"
        : name.toLowerCase() === "x-csrf-token"
          ? token
          : undefined,
  } as unknown as Parameters<typeof runAction>[0];
}
const response = {} as Parameters<typeof runAction>[1];

beforeEach(async () => {
  vi.stubEnv(
    "SESSION_SECRET",
    "auth-limit-test-key-with-at-least-32-characters",
  );
  vi.stubEnv("AUTH_APP_ORIGIN", "https://proofstack.example");
  await pool.query("TRUNCATE rate_limit_buckets");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
afterAll(async () => store.close());

describe("authentication rate-limit isolation", () => {
  it("preserves a named account budget across distinct client IPs", async () => {
    const first = client("192.0.2.3"),
      second = client("192.0.2.4");
    await authLimit(first, "login", "Account@Example.test", 1, 600);
    await expect(
      authLimit(second, "login", "account@example.test", 1, 600),
    ).rejects.toMatchObject({ status: 429, code: "AUTH_RATE_LIMITED" });
    await expect(
      authLimit(second, "login", "other@example.test", 1, 600),
    ).resolves.toBeUndefined();
  });

  it("does not share an OAuth provider's start budget between unrelated client IPs", async () => {
    // Mock only the external identity transport, not the local limiter or flow persistence.
    vi.spyOn(identityProvider, "capabilities").mockResolvedValue({
      google: true,
    } as Awaited<ReturnType<typeof identityProvider.capabilities>>);
    vi.spyOn(identityProvider, "providerClient").mockReturnValue({
      auth: {
        signInWithOAuth: async () => ({
          data: { url: "https://oauth.example.test/authorize" },
          error: null,
        }),
      },
    } as unknown as ReturnType<typeof identityProvider.providerClient>);
    const first = client("192.0.2.5"),
      second = client("192.0.2.6");
    const res = { cookie: vi.fn(), json: vi.fn() } as unknown as Parameters<
      typeof runAction
    >[1];
    const input = { action: "oauth", provider: "google" } as const;
    for (let attempt = 0; attempt < 10; attempt++)
      await runAction(first, res, input, null);
    await expect(runAction(first, res, input, null)).rejects.toMatchObject({
      status: 429,
    });
    await expect(runAction(second, res, input, null)).resolves.toMatchObject({
      authorizationUrl: "https://oauth.example.test/authorize",
    });
  });

  it("does not let one anonymous IP exhaust another IP's action budget", async () => {
    const first = client("192.0.2.1");
    const second = client("192.0.2.2");
    for (let attempt = 0; attempt < 60; attempt++) {
      await expect(actionHandler(first, response)).rejects.toMatchObject({
        status: 401,
        code: "SIGN_IN_REQUIRED",
      });
    }
    await expect(actionHandler(first, response)).rejects.toMatchObject({
      status: 429,
      code: "AUTH_RATE_LIMITED",
    });
    await expect(actionHandler(second, response)).rejects.toMatchObject({
      status: 401,
      code: "SIGN_IN_REQUIRED",
    });
  });
});
