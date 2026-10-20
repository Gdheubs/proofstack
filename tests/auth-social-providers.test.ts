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

// Real SQL (rate limits, OAuth flow rows) on WASM PostgreSQL with the tracked
// migrations; only the external identity provider is replaced.
vi.mock("@workspace/db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { readFile } = await import("node:fs/promises");
  const database = await PGlite.create();
  const folder = new URL("../lib/db/drizzle/", import.meta.url);
  const journal = JSON.parse(
    await readFile(new URL("meta/_journal.json", folder), "utf8"),
  );
  for (const entry of journal.entries)
    await database.exec(
      await readFile(new URL(`${entry.tag}.sql`, folder), "utf8"),
    );
  store.close = () => database.close();
  const query = (text: string, values: unknown[] = []) =>
    database.query(text, values);
  return {
    pool: { query, connect: async () => ({ query, release() {} }) },
  };
});

import { pool } from "@workspace/db";
import { runAction } from "../artifacts/api-server/src/services/auth-actions";
import {
  SOCIAL_PROVIDERS,
  authActionSchema,
} from "../artifacts/api-server/src/services/auth-input";
import * as identityProvider from "../artifacts/api-server/src/services/auth-provider";

const supabase = {
  AUTH_PROVIDER: "supabase",
  SUPABASE_URL: "https://fixture.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture",
  SUPABASE_SECRET_KEY: "s".repeat(40),
  SESSION_SECRET: "s".repeat(40),
  AUTH_APP_ORIGIN: "https://proofstack.example",
};
const stub = (env: Record<string, string>) => {
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
};
// The settings cache lives in module scope; load a fresh copy per case.
async function freshCapabilities(external: Record<string, boolean>) {
  vi.resetModules();
  const fetch = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ external }), { status: 200 }),
    );
  vi.stubGlobal("fetch", fetch);
  const { capabilities } =
    await import("../artifacts/api-server/src/services/auth-provider");
  return { result: await capabilities(), fetch };
}
function request() {
  return {
    ip: "192.0.2.50",
    id: randomUUID(),
    cookies: {},
  } as unknown as Parameters<typeof runAction>[0];
}
const response = { cookie: vi.fn(), json: vi.fn() } as unknown as Parameters<
  typeof runAction
>[1];

beforeEach(async () => {
  stub(supabase);
  await pool.query("TRUNCATE rate_limit_buckets");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
afterAll(async () => store.close());

describe("social provider capabilities", () => {
  it("offers exactly the supported providers Supabase reports enabled, in display order", async () => {
    const { result, fetch } = await freshCapabilities({
      email: true,
      phone: false,
      facebook: true,
      azure: true,
      google: true,
      x: true,
      // Enabled in Supabase but not offered by ProofStack.
      apple: true,
      twitter: true,
      github: false,
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://fixture.supabase.co/auth/v1/settings",
      expect.anything(),
    );
    expect(result.socialProviders).toEqual([
      "google",
      "azure",
      "x",
      "facebook",
    ]);
    expect(result).toMatchObject({ google: true, github: false });
    expect(result.pendingSetup).not.toContain("Social sign-in providers");
  });

  it("offers no social providers and reports setup when none are enabled", async () => {
    const { result } = await freshCapabilities({ email: true });
    expect(result.socialProviders).toEqual([]);
    expect(result.pendingSetup).toContain("Social sign-in providers");
  });

  it("keeps Firebase mode limited to its own Google/GitHub flags", async () => {
    stub({
      AUTH_PROVIDER: "firebase",
      FIREBASE_PROJECT_ID: "test-firebase-project",
      FIREBASE_WEB_PROJECT_ID: "test-firebase-project",
      FIREBASE_WEB_API_KEY: "unit-test-public-web-config",
      FIREBASE_WEB_AUTH_DOMAIN: "test-firebase-project.firebaseapp.com",
      FIREBASE_WEB_APP_ID: "unit-test-web-app",
      FIREBASE_GOOGLE_ENABLED: "false",
      FIREBASE_GITHUB_ENABLED: "true",
    });
    const { result, fetch } = await freshCapabilities({ google: true });
    expect(result.socialProviders).toEqual(["github"]);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("social sign-in start", () => {
  function provider(enabled: readonly string[]) {
    vi.spyOn(identityProvider, "capabilities").mockResolvedValue({
      socialProviders: enabled,
    } as Awaited<ReturnType<typeof identityProvider.capabilities>>);
    const signInWithOAuth = vi.fn(async () => ({
      data: { url: "https://identity.example/authorize" },
      error: null,
    }));
    vi.spyOn(identityProvider, "providerClient").mockReturnValue({
      auth: { signInWithOAuth },
    } as unknown as ReturnType<typeof identityProvider.providerClient>);
    return signInWithOAuth;
  }

  it.each(SOCIAL_PROVIDERS)(
    "starts %s with the exact callback redirect",
    async (id) => {
      const signIn = provider(SOCIAL_PROVIDERS);
      await expect(
        runAction(request(), response, { action: "oauth", provider: id }, null),
      ).resolves.toEqual({
        message: "Continue with the identity provider",
        authorizationUrl: "https://identity.example/authorize",
      });
      expect(signIn).toHaveBeenCalledWith({
        provider: id,
        options: {
          redirectTo: "https://proofstack.example/api/auth/callback",
          skipBrowserRedirect: true,
          // Microsoft needs the email scope to return a verified address.
          ...(id === "azure" ? { scopes: "email" } : {}),
        },
      });
    },
  );

  it("refuses a provider that is not enabled without contacting the identity provider", async () => {
    const signIn = provider(["google"]);
    await expect(
      runAction(
        request(),
        response,
        { action: "oauth", provider: "discord" },
        null,
      ),
    ).rejects.toMatchObject({ status: 503, code: "OAUTH_SETUP_REQUIRED" });
    expect(signIn).not.toHaveBeenCalled();
  });

  it.each(["twitter", "apple", "linkedin", "custom:evil", ""])(
    "rejects unsupported provider id %j at input validation",
    (id) => {
      expect(
        authActionSchema.safeParse({ action: "oauth", provider: id }).success,
      ).toBe(false);
    },
  );
});
