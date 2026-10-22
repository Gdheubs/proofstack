import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as provider from "../artifacts/api-server/src/services/firebase-provider";

const env = {
  NODE_ENV: "test",
  FIREBASE_PROJECT_ID: "proofstack-6acec",
  FIREBASE_WEB_API_KEY: "public-browser-key",
  FIREBASE_WEB_AUTH_DOMAIN: "proofstack-6acec.firebaseapp.com",
  FIREBASE_WEB_PROJECT_ID: "proofstack-6acec",
  FIREBASE_WEB_APP_ID: "1:123456:web:abcdef",
};
const unauthorized = { status: 401, code: "FIREBASE_UNAUTHORIZED" };
const unavailable = { status: 503, code: "FIREBASE_UNAVAILABLE" };

it("exposes only project-bound public browser configuration", () => {
  expect(provider.getFirebasePublicConfig).toBeTypeOf("function");
  expect(
    provider.getFirebasePublicConfig({ ...env, PRIVATE_KEY: "not-public" }),
  ).toEqual({
    apiKey: "public-browser-key",
    authDomain: "proofstack-6acec.firebaseapp.com",
    projectId: "proofstack-6acec",
    appId: "1:123456:web:abcdef",
  });
  for (const change of [
    { FIREBASE_WEB_PROJECT_ID: "other-project" },
    { FIREBASE_WEB_AUTH_DOMAIN: "evil.example" },
    { FIREBASE_WEB_API_KEY: undefined },
    { FIREBASE_WEB_APP_ID: undefined },
    { FIREBASE_WEB_AUTH_DOMAIN: "https://proofstack-6acec.firebaseapp.com" },
  ])
    expect(() =>
      provider.getFirebasePublicConfig({ ...env, ...change }),
    ).toThrow(expect.objectContaining(unavailable));
});

it("reads an allowlisted web config file without leaking file contents on failure", () => {
  const dir = mkdtempSync(join(tmpdir(), "firebase-config-test-"));
  const path = join(dir, "web.json");
  try {
    const fileEnv = {
      NODE_ENV: "test",
      FIREBASE_PROJECT_ID: env.FIREBASE_PROJECT_ID,
      FIREBASE_WEB_CONFIG_FILE: path,
    };
    writeFileSync(
      path,
      JSON.stringify({
        apiKey: "public-browser-key",
        authDomain: env.FIREBASE_WEB_AUTH_DOMAIN,
        projectId: env.FIREBASE_PROJECT_ID,
        appId: env.FIREBASE_WEB_APP_ID,
        private_key: "fake-private-content",
      }),
    );
    expect(provider.getFirebasePublicConfig(fileEnv)).toEqual(
      provider.getFirebasePublicConfig(env),
    );
    writeFileSync(path, "{fake-private-content");
    expect(() => provider.getFirebasePublicConfig(fileEnv)).toThrow(
      expect.objectContaining(unavailable),
    );
    writeFileSync(
      path,
      JSON.stringify({
        apiKey: {},
        appId: "bad",
        projectId: "other",
        authDomain: "evil",
      }),
    );
    expect(() => provider.getFirebasePublicConfig(fileEnv)).toThrow(
      expect.objectContaining(unavailable),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

const now = Math.floor(Date.now() / 1000);
beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(now * 1000);
});
afterEach(() => {
  vi.restoreAllMocks();
});
function fixture(
  tokenChanges: Record<string, unknown> = {},
  userChanges: Record<string, unknown> = {},
) {
  const decoded = {
    uid: "user-123",
    sub: "user-123",
    aud: env.FIREBASE_PROJECT_ID,
    iss: `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`,
    iat: now,
    exp: now + 3600,
    auth_time: now - 10,
    email: "person@example.test",
    email_verified: true,
    firebase: {
      sign_in_provider: "google.com",
      identities: { "google.com": ["google-id"] },
    },
    ...tokenChanges,
  } as Awaited<ReturnType<provider.FirebaseAdminBoundary["verifyIdToken"]>>;
  const user = {
    uid: "user-123",
    disabled: false,
    email: "person@example.test",
    emailVerified: true,
    displayName: "Person",
    metadata: {
      creationTime: "2026-10-14T00:00:00Z",
      lastSignInTime: "2026-10-14T00:00:00Z",
      toJSON: () => ({}),
    },
    providerData: [],
    toJSON: () => ({}),
    multiFactor: { enrolledFactors: [], toJSON: () => ({}) },
    ...userChanges,
  } as Awaited<ReturnType<provider.FirebaseAdminBoundary["getUser"]>>;
  const admin = {
    verifyIdToken: vi.fn(async () => decoded),
    verifySessionCookie: vi.fn(async () => ({
      ...decoded,
      iss: `https://session.firebase.google.com/${env.FIREBASE_PROJECT_ID}`,
    })),
    getUser: vi.fn(async () => user),
    createSessionCookie: vi.fn(async () => "signed-cookie"),
  };
  return { decoded, user, admin };
}

it("verifies a revoked-checked ID token and returns a provider-owned principal", async () => {
  expect(provider.createFirebaseProvider).toBeTypeOf("function");
  const { admin, decoded } = fixture();
  const result = await provider
    .createFirebaseProvider({ env, admin })
    .verifyIdToken("signed-id-token");
  expect(admin.verifyIdToken).toHaveBeenCalledWith("signed-id-token", true);
  expect(admin.getUser).toHaveBeenCalledWith("user-123");
  expect(result.decoded).toEqual(decoded);
  expect(result.principal).toEqual({
    provider: "firebase",
    projectId: env.FIREBASE_PROJECT_ID,
    subject: "firebase:proofstack-6acec:user-123",
    uid: "user-123",
    email: "person@example.test",
    phoneNumber: null,
    displayName: "Person",
    nativeFactors: [],
    assurance: "aal1",
    authTime: now - 10,
  });
});

it.each([
  ["wrong audience", { aud: "other-project" }],
  ["wrong issuer", { iss: "https://securetoken.google.com/other-project" }],
  ["wrong subject", { sub: "another-user" }],
  ["empty uid", { uid: "" }],
  ["oversized uid", { uid: "x".repeat(129), sub: "x".repeat(129) }],
  ["expired token", { exp: now - 1 }],
  ["future issued token", { iat: now + 61 }],
  ["unsupported password mode", { firebase: { sign_in_provider: "password" } }],
  ["missing Firebase claim", { firebase: undefined }],
])("rejects %s before reading any user identity", async (_label, changes) => {
  const { admin } = fixture(changes as Record<string, unknown>);
  await expect(
    provider
      .createFirebaseProvider({ env, admin })
      .verifyIdToken("signed-id-token"),
  ).rejects.toMatchObject(unauthorized);
  expect(admin.getUser).not.toHaveBeenCalled();
});

it("accepts Github as the original federated sign-in provider", async () => {
  const { admin } = fixture({ firebase: { sign_in_provider: "github.com" } });
  await expect(
    provider
      .createFirebaseProvider({ env, admin })
      .verifyIdToken("signed-id-token"),
  ).resolves.toMatchObject({ principal: { assurance: "aal1" } });
});

it.each([now - 301, now + 61, undefined, "recent", NaN, -1])(
  "rejects stale or invalid auth_time %s at initial sign-in",
  async (auth_time) => {
    const { admin } = fixture({ auth_time });
    await expect(
      provider
        .createFirebaseProvider({ env, admin })
        .verifyIdToken("signed-id-token"),
    ).rejects.toMatchObject(unauthorized);
    expect(admin.getUser).not.toHaveBeenCalled();
  },
);
it("accepts exactly 300-second recent authentication and bounded clock skew", async () => {
  const clock = vi.spyOn(Date, "now").mockReturnValue(now * 1000);
  try {
    for (const auth_time of [now - 300, now + 60]) {
      const { admin } = fixture({ auth_time });
      await expect(
        provider
          .createFirebaseProvider({ env, admin })
          .verifyIdToken("signed-id-token"),
      ).resolves.toMatchObject({ principal: { authTime: auth_time } });
    }
  } finally {
    clock.mockRestore();
  }
});

it.each([
  ["disabled user", {}, { disabled: true }],
  ["different current uid", {}, { uid: "other-user" }],
  ["token email not verified", { email_verified: false }, {}],
  ["current email not verified", {}, { emailVerified: false }],
  ["changed email", {}, { email: "different@example.test" }],
  [
    "no verified contact",
    { email: undefined, email_verified: false },
    { email: undefined, emailVerified: false },
  ],
  [
    "mismatched phone",
    { email_verified: false, phone_number: "+15555550123" },
    { phoneNumber: "+15555550124" },
  ],
])(
  "rejects %s from the current Admin user record",
  async (_label, token, user) => {
    const { admin } = fixture(
      token as Record<string, unknown>,
      user as Record<string, unknown>,
    );
    await expect(
      provider
        .createFirebaseProvider({ env, admin })
        .verifyIdToken("signed-id-token"),
    ).rejects.toMatchObject(unauthorized);
  },
);

it("returns only verified contacts and keeps same-email identities separated by uid", async () => {
  const first = fixture(
    {
      uid: "uid:one",
      sub: "uid:one",
      email_verified: false,
      phone_number: "+15555550123",
    },
    { uid: "uid:one", emailVerified: false, phoneNumber: "+15555550123" },
  );
  const second = fixture(
    { uid: "uid:two", sub: "uid:two" },
    { uid: "uid:two" },
  );
  const a = await provider
    .createFirebaseProvider({ env, admin: first.admin })
    .verifyIdToken("signed-id-token");
  const b = await provider
    .createFirebaseProvider({ env, admin: second.admin })
    .verifyIdToken("signed-id-token");
  expect(a.principal).toMatchObject({
    email: null,
    phoneNumber: "+15555550123",
    subject: "firebase:proofstack-6acec:uid%3Aone",
  });
  expect(a.principal.subject).not.toBe(b.principal.subject);
});

const factor = {
  uid: "native-factor-1",
  factorId: "totp",
  displayName: "Authenticator",
  enrollmentTime: "2026-10-14T00:00:00Z",
};
it("does not treat factor enrollment or custom AAL/role claims as MFA proof", async () => {
  const { admin } = fixture(
    { aal: "aal2", role: "admin", amr: ["mfa"], mfa: true },
    { multiFactor: { enrolledFactors: [factor] } },
  );
  const result = await provider
    .createFirebaseProvider({ env, admin })
    .verifyIdToken("signed-id-token");
  expect(result.principal).toMatchObject({
    assurance: "aal1",
    nativeFactors: [
      {
        uid: "native-factor-1",
        factorId: "totp",
        displayName: "Authenticator",
      },
    ],
  });
});

it.each(["totp", "phone"])(
  "elevates only SDK-verified native %s proof matching the current enrolled factor",
  async (factorId) => {
    const { admin } = fixture(
      {
        firebase: {
          sign_in_provider: "google.com",
          sign_in_second_factor: factorId,
          second_factor_identifier: "native-factor-1",
        },
      },
      { multiFactor: { enrolledFactors: [{ ...factor, factorId }] } },
    );
    await expect(
      provider
        .createFirebaseProvider({ env, admin })
        .verifyIdToken("signed-id-token"),
    ).resolves.toMatchObject({ principal: { assurance: "aal2" } });
  },
);
it.each([
  [
    "removed factor",
    {
      sign_in_second_factor: "totp",
      second_factor_identifier: "native-factor-1",
    },
    [],
  ],
  [
    "wrong factor id",
    { sign_in_second_factor: "totp", second_factor_identifier: "other-factor" },
    [factor],
  ],
  [
    "wrong factor type",
    {
      sign_in_second_factor: "phone",
      second_factor_identifier: "native-factor-1",
    },
    [factor],
  ],
  ["missing factor id", { sign_in_second_factor: "totp" }, [factor]],
  [
    "missing second-factor proof",
    { second_factor_identifier: "native-factor-1" },
    [factor],
  ],
  [
    "unsupported factor type",
    {
      sign_in_second_factor: "custom",
      second_factor_identifier: "native-factor-1",
    },
    [{ ...factor, factorId: "custom" }],
  ],
])("fails closed for native MFA %s", async (_label, claims, factors) => {
  const { admin } = fixture(
    { firebase: { sign_in_provider: "google.com", ...(claims as object) } },
    { multiFactor: { enrolledFactors: factors } },
  );
  await expect(
    provider
      .createFirebaseProvider({ env, admin })
      .verifyIdToken("signed-id-token"),
  ).rejects.toMatchObject(unauthorized);
});

it("mints a session cookie only after verified recent sign-in and reads it back", async () => {
  const { admin } = fixture();
  const auth = provider.createFirebaseProvider({ env, admin });
  expect(auth.createSessionCookie).toBeTypeOf("function");
  const result = await auth.createSessionCookie("signed-id-token", 3_600_000);
  expect(admin.createSessionCookie).toHaveBeenCalledWith("signed-id-token", {
    expiresIn: 3_600_000,
  });
  expect(admin.verifySessionCookie).toHaveBeenCalledWith("signed-cookie", true);
  expect(result).toMatchObject({
    credentials: { provider: "firebase", sessionCookie: "signed-cookie" },
    principal: { uid: "user-123", assurance: "aal1" },
    decoded: {
      iss: `https://session.firebase.google.com/${env.FIREBASE_PROJECT_ID}`,
    },
  });
  const stale = fixture({ auth_time: now - 301 });
  await expect(
    provider
      .createFirebaseProvider({ env, admin: stale.admin })
      .createSessionCookie("stale-id", 3_600_000),
  ).rejects.toMatchObject(unauthorized);
  expect(stale.admin.createSessionCookie).not.toHaveBeenCalled();
});

it("checks ongoing session revocation and current factor membership without requiring a new login every five minutes", async () => {
  const { admin, user } = fixture(
    {
      auth_time: now - 3600,
      firebase: {
        sign_in_provider: "google.com",
        sign_in_second_factor: "totp",
        second_factor_identifier: "native-factor-1",
      },
    },
    { multiFactor: { enrolledFactors: [factor] } },
  );
  const auth = provider.createFirebaseProvider({ env, admin });
  const credentials: provider.FirebaseCredentials = {
    provider: "firebase",
    sessionCookie: "existing-cookie",
  };
  expect(auth.verifySessionCookie).toBeTypeOf("function");
  await expect(auth.verifySessionCookie(credentials)).resolves.toMatchObject({
    principal: { assurance: "aal2", authTime: now - 3600 },
  });
  expect(admin.verifySessionCookie).toHaveBeenCalledWith(
    "existing-cookie",
    true,
  );
  user.multiFactor!.enrolledFactors = [];
  await expect(auth.verifySessionCookie(credentials)).rejects.toMatchObject(
    unauthorized,
  );
  Object.assign(user, { disabled: true });
  await expect(auth.verifySessionCookie(credentials)).rejects.toMatchObject(
    unauthorized,
  );
});

it.each([
  ["auth/id-token-revoked", 401],
  ["auth/id-token-expired", 401],
  ["auth/invalid-id-token", 401],
  ["auth/session-cookie-revoked", 401],
  ["auth/session-cookie-expired", 401],
  ["auth/invalid-session-cookie", 401],
  ["auth/user-disabled", 401],
  ["auth/user-not-found", 401],
  ["auth/argument-error", 401],
  ["auth/invalid-argument", 401],
  ["auth/internal-error", 503],
  ["app/network-error", 503],
  ["auth/invalid-credential", 503],
  ["unrecognized", 503],
])("maps SDK %s safely at every external boundary", async (code, status) => {
  for (const method of [
    "verifyIdToken",
    "verifySessionCookie",
    "getUser",
    "createSessionCookie",
  ] as const) {
    const { admin } = fixture();
    admin[method].mockRejectedValueOnce(
      Object.assign(new Error("RAW-SDK fake-token fake-secret"), { code }),
    );
    const auth = provider.createFirebaseProvider({ env, admin });
    const action =
      method === "verifySessionCookie"
        ? auth.verifySessionCookie({
            provider: "firebase",
            sessionCookie: "existing-cookie",
          })
        : method === "createSessionCookie"
          ? auth.createSessionCookie("signed-id-token", 3_600_000)
          : auth.verifyIdToken("signed-id-token");
    await expect(action).rejects.toMatchObject(
      status === 401 ? unauthorized : unavailable,
    );
    await expect(action).rejects.not.toHaveProperty(
      "message",
      expect.stringContaining("RAW-SDK"),
    );
  }
});

it("keeps Firebase Admin lazy and refuses emulator configuration outside tests", async () => {
  expect(provider.getFirebaseAuth).toBeTypeOf("function");
  expect(() => provider.createFirebaseProvider({ env })).not.toThrow();
  await expect(
    provider.getFirebaseAuth({ NODE_ENV: "production" }),
  ).rejects.toMatchObject(unavailable);
  for (const NODE_ENV of ["production", "development", undefined]) {
    const bad = {
      ...env,
      NODE_ENV,
      FIREBASE_AUTH_EMULATOR_HOST: "localhost:9099",
    };
    await expect(provider.getFirebaseAuth(bad)).rejects.toMatchObject(
      unavailable,
    );
    expect(() =>
      provider.createFirebaseProvider({ env: bad, admin: fixture().admin }),
    ).toThrow(expect.objectContaining(unavailable));
  }
});
it("prohibits dependency injection outside a test environment", () => {
  expect(() =>
    provider.createFirebaseProvider({
      env: { ...env, NODE_ENV: "production" },
      admin: fixture().admin,
    }),
  ).toThrow(expect.objectContaining(unavailable));
});

it.each(["", " token ", undefined, 42, "x".repeat(16_385)])(
  "rejects malformed ID-token input before SDK access",
  async (value) => {
    const { admin } = fixture();
    const auth = provider.createFirebaseProvider({ env, admin });
    await expect(auth.verifyIdToken(value as string)).rejects.toMatchObject(
      unauthorized,
    );
    expect(admin.verifyIdToken).not.toHaveBeenCalled();
  },
);
it.each([
  undefined,
  {},
  { provider: "supabase", sessionCookie: "signed-cookie" },
  { provider: "firebase", sessionCookie: "" },
  { provider: "firebase", sessionCookie: 42 },
  { provider: "firebase", sessionCookie: "x".repeat(16_385) },
])(
  "rejects unsupported or malformed credential input before SDK access",
  async (value) => {
    const { admin } = fixture();
    await expect(
      provider
        .createFirebaseProvider({ env, admin })
        .verifySessionCookie(value as provider.FirebaseCredentials),
    ).rejects.toMatchObject(unauthorized);
    expect(admin.verifySessionCookie).not.toHaveBeenCalled();
  },
);
it.each([299_999, 1_209_600_001, 3.5, NaN, undefined])(
  "rejects unsafe session lifetime %s before minting",
  async (expiresIn) => {
    const { admin } = fixture();
    await expect(
      provider
        .createFirebaseProvider({ env, admin })
        .createSessionCookie("signed-id-token", expiresIn as number),
    ).rejects.toMatchObject(unavailable);
    expect(admin.createSessionCookie).not.toHaveBeenCalled();
    expect(admin.verifyIdToken).not.toHaveBeenCalled();
  },
);

it("exports the lazy Admin auth client and a safe error adapter for integration-only Admin operations", async () => {
  expect(provider.getFirebaseAdminAuth).toBeTypeOf("function");
  await expect(
    provider.getFirebaseAdminAuth({ NODE_ENV: "production" }),
  ).rejects.toMatchObject(unavailable);
  expect(provider.mapFirebaseAdminError).toBeTypeOf("function");
  expect(
    provider.mapFirebaseAdminError(
      Object.assign(new Error("fake-secret"), { code: "auth/user-not-found" }),
    ),
  ).toMatchObject({
    ...unauthorized,
    message: "Your sign-in has expired. Sign in again",
  });
  expect(
    provider.mapFirebaseAdminError(new Error("fake-secret")),
  ).toMatchObject({
    ...unavailable,
    message: "Sign-in is temporarily unavailable",
  });
});

it("refuses session-cookie readback that loses native MFA proof", async () => {
  const { admin, decoded } = fixture(
    {
      firebase: {
        sign_in_provider: "google.com",
        sign_in_second_factor: "totp",
        second_factor_identifier: "native-factor-1",
      },
    },
    { multiFactor: { enrolledFactors: [factor] } },
  );
  admin.verifySessionCookie.mockResolvedValueOnce({
    ...decoded,
    iss: `https://session.firebase.google.com/${env.FIREBASE_PROJECT_ID}`,
    firebase: { identities: {}, sign_in_provider: "google.com" },
  });
  await expect(
    provider
      .createFirebaseProvider({ env, admin })
      .createSessionCookie("signed-id-token", 604_800_000),
  ).rejects.toMatchObject(unauthorized);
});

it("refuses tenant-scoped tokens because tenant identities are not a supported namespace", async () => {
  const { admin } = fixture({
    firebase: { sign_in_provider: "google.com", tenant: "another-tenant" },
  });
  await expect(
    provider
      .createFirebaseProvider({ env, admin })
      .verifyIdToken("signed-id-token"),
  ).rejects.toMatchObject(unauthorized);
  expect(admin.getUser).not.toHaveBeenCalled();
});
it("cannot bypass production emulator refusal using a test-only env override", async () => {
  vi.stubEnv("NODE_ENV", "production");
  try {
    expect(() =>
      provider.createFirebaseProvider({
        env: { ...env, FIREBASE_AUTH_EMULATOR_HOST: "localhost:9099" },
      }),
    ).toThrow(expect.objectContaining(unavailable));
    await expect(
      provider.getFirebaseAdminAuth({
        ...env,
        FIREBASE_AUTH_EMULATOR_HOST: "localhost:9099",
      }),
    ).rejects.toMatchObject(unavailable);
  } finally {
    vi.unstubAllEnvs();
  }
});

describe("Firebase configuration policy", () => {
  it("requires an explicit valid Firebase project id", () => {
    expect(provider?.getFirebaseProjectId).toBeTypeOf("function");
    expect(
      provider!.getFirebaseProjectId({
        FIREBASE_PROJECT_ID: "proofstack-6acec",
      }),
    ).toBe("proofstack-6acec");
    for (const project of [
      undefined,
      "",
      "Other Project",
      "a",
      "123456",
      "proofstack-6acec ",
    ]) {
      expect(() =>
        provider!.getFirebaseProjectId({ FIREBASE_PROJECT_ID: project }),
      ).toThrow(
        expect.objectContaining({ status: 503, code: "FIREBASE_UNAVAILABLE" }),
      );
    }
  });
});
