import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { digest } from "../artifacts/api-server/src/lib/auth-crypto";
import { ApiError } from "../artifacts/api-server/src/lib/errors";
import type { MfaInput } from "../artifacts/api-server/src/services/auth-input";
import type {
  AuthSession,
  ProviderIdentity,
  SupabaseAppSession,
  transaction,
} from "../artifacts/api-server/src/services/auth-sessions";
import { mfaAction } from "../artifacts/api-server/src/services/auth-mfa";

type TransactionClient = Parameters<Parameters<typeof transaction>[0]>[0];

const boundary = vi.hoisted(() => ({
  authLimit: vi.fn(),
  capabilities: vi.fn(),
  enroll: vi.fn(),
  challenge: vi.fn(),
  verify: vi.fn(),
  challengeAndVerify: vi.fn(),
  unenroll: vi.fn(),
  deleteFactor: vi.fn(),
  audit: vi.fn(),
  saveCredentials: vi.fn(),
  revokeSessions: vi.fn(),
  transaction:
    vi.fn<
      (fn: (tx: TransactionClient) => Promise<unknown>) => Promise<unknown>
    >(),
  query:
    vi.fn<
      (sql: string, values?: unknown[]) => Promise<{ rows: { id: string }[] }>
    >(),
  database: vi.fn(() => {
    throw new Error("Unexpected real database boundary");
  }),
  network: vi.fn(() => {
    throw new Error("Unexpected network request");
  }),
  events: [] as string[],
}));

vi.mock("@workspace/db", () => ({
  pool: { connect: boundary.database, query: boundary.database },
}));
// Avoid the circular session hydrator; these tests supply an already-read session.
vi.mock("../artifacts/api-server/src/services/firebase-sessions", () => ({
  readFirebaseAppSession: vi.fn(),
}));
vi.mock("../artifacts/api-server/src/services/auth-limits", () => ({
  authLimit: boundary.authLimit,
}));
vi.mock(
  "../artifacts/api-server/src/services/auth-provider",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("../artifacts/api-server/src/services/auth-provider")
    >()),
    capabilities: boundary.capabilities,
    adminClient: () => ({
      auth: { admin: { mfa: { deleteFactor: boundary.deleteFactor } } },
    }),
  }),
);
vi.mock(
  "../artifacts/api-server/src/services/auth-sessions",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("../artifacts/api-server/src/services/auth-sessions")
    >()),
    audit: boundary.audit,
    saveCredentials: boundary.saveCredentials,
    revokeSessions: boundary.revokeSessions,
    transaction: boundary.transaction,
  }),
);

const now = new Date("2026-01-01T12:00:00Z");
const req = { id: "mfa-unit-request" } as Request;
const clearCookie = vi.fn();
const res = { clearCookie } as unknown as Response;
const tx = { query: boundary.query } as unknown as TransactionClient;
const credentials = {
  access_token: "unit-access",
  refresh_token: "unit-refresh",
};
const totpData = {
  id: "new-factor",
  type: "totp",
  totp: { qr_code: "unit-qr", secret: "unit-totp-secret" },
};
const recoveryCode = "ABCDE-12345-ABCDE-12345-ABCDE-12345-ABCDE-12345";

function factor(
  id = "factor",
  factor_type: "totp" | "phone" = "totp",
  status: "verified" | "unverified" = "verified",
): NonNullable<ProviderIdentity["factors"]>[number] {
  return { id, factor_type, status, friendly_name: "Unit factor" };
}

function session(verified = true): SupabaseAppSession {
  return {
    provider: "supabase",
    user: {
      id: "account-id",
      displayName: "Unit account",
      kind: "developer",
      email: "unit@example.test",
      phone: null,
      emailVerified: true,
      phoneVerified: false,
      platformRole: null,
      status: "active",
      mfaRecoveryRequired: false,
    },
    providerUser: {
      id: "provider-id",
      user_metadata: {},
      factors: verified ? [factor()] : [],
    },
    row: {
      id: "session-id",
      user_id: "account-id",
      provider_session_id: "provider-session",
      encrypted_credentials: "unit-envelope",
      device_hash: "unit-device",
      device_label: "Unit browser",
      created_at: now,
      last_seen_at: now,
      expires_at: new Date("2026-01-02T12:00:00Z"),
      revoked_at: null,
      last_mfa_at: verified ? now : null,
      password_recovery: false,
    },
    client: {
      auth: {
        mfa: {
          enroll: boundary.enroll,
          challenge: boundary.challenge,
          verify: boundary.verify,
          challengeAndVerify: boundary.challengeAndVerify,
          unenroll: boundary.unenroll,
        },
      },
    } as unknown as SupabaseAppSession["client"],
    credentials,
    aal: verified ? "aal2" : "aal1",
    mfaRequired: verified,
    privileged: false,
  };
}

function act(input: MfaInput, current: AuthSession | null = session()) {
  return mfaAction(req, res, input, current);
}

function expectNoMutation() {
  for (const mock of [
    boundary.enroll,
    boundary.verify,
    boundary.challengeAndVerify,
    boundary.unenroll,
    boundary.deleteFactor,
    boundary.saveCredentials,
    boundary.transaction,
    boundary.audit,
    boundary.revokeSessions,
    clearCookie,
  ]) {
    expect(mock).not.toHaveBeenCalled();
  }
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubEnv("AUTH_PROVIDER", "supabase");
  vi.stubEnv(
    "SESSION_SECRET",
    "unit-test-only-mfa-key-with-at-least-32-characters",
  );
  vi.stubGlobal("fetch", boundary.network);
  boundary.events.length = 0;
  boundary.database.mockImplementation(() => {
    throw new Error("Unexpected real database boundary");
  });
  boundary.network.mockImplementation(() => {
    throw new Error("Unexpected network request");
  });
  boundary.authLimit.mockResolvedValue(undefined);
  boundary.capabilities.mockResolvedValue({ phoneMfa: true });
  boundary.enroll.mockResolvedValue({ data: totpData, error: null });
  boundary.challenge.mockResolvedValue({
    data: { id: "challenge" },
    error: null,
  });
  boundary.verify.mockResolvedValue({ data: credentials, error: null });
  boundary.challengeAndVerify.mockResolvedValue({
    data: credentials,
    error: null,
  });
  boundary.unenroll.mockResolvedValue({ data: {}, error: null });
  boundary.deleteFactor.mockImplementation(async ({ id }: { id: string }) => {
    boundary.events.push(`delete:${id}`);
    return { data: {}, error: null };
  });
  boundary.query.mockImplementation(async (sql) => {
    boundary.events.push(sql);
    return { rows: [] };
  });
  // Executes service callbacks only: not a SQL engine or a transaction/rollback simulation.
  boundary.transaction.mockImplementation(async (fn) => {
    boundary.events.push("transaction:start");
    const result = await fn(tx);
    boundary.events.push("transaction:end");
    return result;
  });
  boundary.audit.mockImplementation(async (_req: Request, action: string) => {
    boundary.events.push(action);
  });
  boundary.saveCredentials.mockImplementation(async () => {
    boundary.events.push("saveCredentials");
  });
  boundary.revokeSessions.mockImplementation(async () => {
    boundary.events.push("revokeSessions");
  });
  clearCookie.mockImplementation(() => {
    boundary.events.push("clearCookie");
    return res;
  });
});

afterEach(() => {
  expect(boundary.database).not.toHaveBeenCalled();
  expect(boundary.network).not.toHaveBeenCalled();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("MFA session and freshness restrictions (real guards)", () => {
  it("rejects anonymous requests before rate limiting or provider work", async () => {
    await expect(
      act({ action: "mfa-enroll", factorType: "totp" }, null),
    ).rejects.toMatchObject({ status: 401, code: "SIGN_IN_REQUIRED" });
    expect(boundary.authLimit).not.toHaveBeenCalled();
    expectNoMutation();
  });

  it.each(["configured-provider", "session-provider"])(
    "rejects Firebase via %s",
    async (mode) => {
      let current: AuthSession = session();
      if (mode === "configured-provider")
        vi.stubEnv("AUTH_PROVIDER", "firebase");
      else
        current = {
          ...current,
          provider: "firebase",
          client: null,
          credentials: {
            provider: "firebase",
            sessionCookie: "unit-session-cookie",
          },
          firebase: { uid: "provider-id", projectId: "unit-project" },
        };
      await expect(
        act({ action: "mfa-enroll", factorType: "totp" }, current),
      ).rejects.toMatchObject({ status: 409, code: "AUTH_METHOD_UNAVAILABLE" });
      expect(boundary.authLimit).not.toHaveBeenCalled();
      expectNoMutation();
    },
  );

  it("stops before provider calls when the shared MFA limiter rejects", async () => {
    boundary.authLimit.mockRejectedValue(
      new ApiError(429, "AUTH_RATE_LIMITED", "Unit limit"),
    );
    await expect(
      act({ action: "mfa-enroll", factorType: "totp" }),
    ).rejects.toMatchObject({ status: 429, code: "AUTH_RATE_LIMITED" });
    expect(boundary.authLimit).toHaveBeenCalledExactlyOnceWith(
      req,
      "mfa",
      "account-id",
      10,
      600,
    );
    expectNoMutation();
  });

  it.each<MfaInput>([
    { action: "mfa-enroll", factorType: "totp" },
    { action: "mfa-remove", factorId: "factor" },
    { action: "recover-mfa", code: recoveryCode },
  ])(
    "requires a fresh primary login for $action without verified factors",
    async (input) => {
      const current = session(false);
      current.providerUser.factors = [factor("factor", "totp", "unverified")];
      current.row.created_at = new Date("2026-01-01T11:54:59Z");
      await expect(act(input, current)).rejects.toMatchObject({
        status: 403,
        code: "REAUTHENTICATION_REQUIRED",
      });
      expectNoMutation();
    },
  );

  it.each<MfaInput>([
    { action: "mfa-enroll", factorType: "totp" },
    { action: "mfa-remove", factorId: "factor" },
    { action: "recovery-codes" },
  ])(
    "requires native AAL2 for $action with an existing factor",
    async (input) => {
      const current = session();
      current.aal = "aal1";
      await expect(act(input, current)).rejects.toMatchObject({
        status: 403,
        code: "MFA_REQUIRED",
      });
      expectNoMutation();
    },
  );

  it.each([null, new Date("2026-01-01T11:54:59Z")])(
    "requires a fresh MFA timestamp (%s)",
    async (lastMfa) => {
      const current = session();
      current.row.last_mfa_at = lastMfa;
      await expect(
        act({ action: "recovery-codes" }, current),
      ).rejects.toMatchObject({ status: 403, code: "MFA_STEP_UP_REQUIRED" });
      expectNoMutation();
    },
  );

  it("blocks account-level changes during recovery even with fresh AAL2", async () => {
    const current = session();
    current.user.mfaRecoveryRequired = true;
    await expect(
      act({ action: "mfa-enroll", factorType: "totp" }, current),
    ).rejects.toMatchObject({ status: 403, code: "MFA_REQUIRED" });
    expectNoMutation();
  });
});

describe("MFA enrollment", () => {
  it("returns TOTP provisioning data for a first factor at the five-minute freshness boundary", async () => {
    const current = session(false);
    current.row.created_at = new Date("2026-01-01T11:55:00Z");
    await expect(
      act({ action: "mfa-enroll", factorType: "totp" }, current),
    ).resolves.toEqual({
      message: "Scan with your authenticator app, then enter its code",
      factor: {
        id: "new-factor",
        type: "totp",
        qrCode: "unit-qr",
        secret: "unit-totp-secret",
      },
    });
    expect(boundary.enroll).toHaveBeenCalledExactlyOnceWith({
      factorType: "totp",
      friendlyName: expect.stringMatching(/^Authenticator [a-f0-9]{8}$/),
    });
    expect(boundary.audit).toHaveBeenCalledExactlyOnceWith(
      req,
      "auth.mfa_enrollment_started",
      "account-id",
      "account-id",
      { method: "totp" },
    );
    expect(boundary.capabilities).not.toHaveBeenCalled();
    expect(boundary.saveCredentials).not.toHaveBeenCalled();
  });

  it("allows another enrollment with fresh native MFA despite an older primary login", async () => {
    const current = session();
    current.row.created_at = new Date(0);
    await expect(
      act({ action: "mfa-enroll", factorType: "totp" }, current),
    ).resolves.toHaveProperty("factor.id", "new-factor");
  });

  it("allows fresh primary-authenticated re-enrollment after recovery removed all factors", async () => {
    const current = session(false);
    current.user.mfaRecoveryRequired = true;
    current.mfaRequired = true;
    await expect(
      act({ action: "mfa-enroll", factorType: "totp" }, current),
    ).resolves.toHaveProperty("factor.id", "new-factor");
    expect(boundary.saveCredentials).not.toHaveBeenCalled();
    expect(boundary.transaction).not.toHaveBeenCalled();
    expect(current.user.mfaRecoveryRequired).toBe(true);
  });

  it("enrolls a configured phone factor without exposing provisioning secrets", async () => {
    boundary.enroll.mockResolvedValue({
      data: { id: "phone-factor", type: "phone" },
      error: null,
    });
    await expect(
      act(
        { action: "mfa-enroll", factorType: "phone", phone: "+12025550123" },
        session(false),
      ),
    ).resolves.toEqual({
      message: "Request a code to verify this phone factor",
      factor: { id: "phone-factor", type: "phone" },
    });
    expect(boundary.enroll).toHaveBeenCalledExactlyOnceWith({
      factorType: "phone",
      phone: "+12025550123",
    });
    expect(boundary.audit).toHaveBeenCalledExactlyOnceWith(
      req,
      "auth.mfa_enrollment_started",
      "account-id",
      "account-id",
      { method: "phone" },
    );
  });

  it.each([
    { enabled: false, code: "PHONE_MFA_SETUP_REQUIRED", status: 503 },
    { enabled: true, code: "PHONE_REQUIRED", status: 400 },
  ])(
    "rejects phone enrollment with $code",
    async ({ enabled, code, status }) => {
      boundary.capabilities.mockResolvedValue({ phoneMfa: enabled });
      await expect(
        act({ action: "mfa-enroll", factorType: "phone" }, session(false)),
      ).rejects.toMatchObject({ code, status });
      expectNoMutation();
    },
  );

  it.each([null, { id: "wrong-type", type: "phone" }])(
    "rejects absent or non-TOTP provisioning data (%s)",
    async (data) => {
      boundary.enroll.mockResolvedValue({ data, error: null });
      await expect(
        act({ action: "mfa-enroll", factorType: "totp" }, session(false)),
      ).rejects.toMatchObject({ status: 503, code: "MFA_UNAVAILABLE" });
      expect(boundary.audit).not.toHaveBeenCalled();
    },
  );

  it.each(["totp", "phone"] as const)(
    "does not audit failed %s enrollment",
    async (factorType) => {
      boundary.enroll.mockResolvedValue({ data: null, error: { status: 503 } });
      await expect(
        act(
          { action: "mfa-enroll", factorType, phone: "+12025550123" },
          session(false),
        ),
      ).rejects.toMatchObject({
        status: 503,
        code: "AUTH_PROVIDER_UNAVAILABLE",
      });
      expect(boundary.audit).not.toHaveBeenCalled();
    },
  );
});

describe("MFA factor ownership and challenges", () => {
  it.each<MfaInput>([
    { action: "mfa-challenge", factorId: "foreign" },
    { action: "mfa-verify", factorId: "foreign", code: "123456" },
    { action: "mfa-remove", factorId: "foreign" },
  ])(
    "rejects an unowned factor for $action before provider work",
    async (input) => {
      await expect(act(input)).rejects.toMatchObject({
        status: 404,
        code: "FACTOR_NOT_FOUND",
      });
      expect(boundary.challenge).not.toHaveBeenCalled();
      expectNoMutation();
    },
  );

  it("does not treat an unsupported provider factor as a manageable factor", async () => {
    const current = session();
    current.providerUser.factors = [{ ...factor(), factor_type: "webauthn" }];
    await expect(
      act({ action: "mfa-challenge", factorId: "factor" }, current),
    ).rejects.toMatchObject({ code: "FACTOR_NOT_FOUND" });
    expect(boundary.challenge).not.toHaveBeenCalled();
  });

  it.each([
    { type: "totp" as const, message: "Authenticator challenge created" },
    { type: "phone" as const, message: "Provider-issued code requested" },
  ])(
    "creates a $type challenge without requiring existing AAL2",
    async ({ type, message }) => {
      const current = session(false);
      current.providerUser.factors = [factor("factor", type)];
      await expect(
        act({ action: "mfa-challenge", factorId: "factor" }, current),
      ).resolves.toEqual({ message, challengeId: "challenge" });
      expect(boundary.challenge).toHaveBeenCalledExactlyOnceWith({
        factorId: "factor",
      });
      expect(boundary.saveCredentials).not.toHaveBeenCalled();
    },
  );

  it("propagates provider challenge rate limits", async () => {
    boundary.challenge.mockResolvedValue({
      data: null,
      error: { status: 429 },
    });
    await expect(
      act({ action: "mfa-challenge", factorId: "factor" }),
    ).rejects.toMatchObject({ status: 429, code: "AUTH_RATE_LIMITED" });
    expectNoMutation();
  });
});

describe("MFA verification", () => {
  it.each(["totp", "phone"] as const)(
    "verifies a supplied %s challenge and saves credentials before clearing recovery",
    async (type) => {
      const current = session(false);
      current.providerUser.factors = [factor("factor", type, "unverified")];
      current.user.mfaRecoveryRequired = true;
      await expect(
        act(
          {
            action: "mfa-verify",
            factorId: "factor",
            challengeId: "challenge",
            code: "123456",
          },
          current,
        ),
      ).resolves.toEqual({
        message: "Security factor verified",
        signedIn: true,
      });
      expect(boundary.verify).toHaveBeenCalledExactlyOnceWith({
        factorId: "factor",
        challengeId: "challenge",
        code: "123456",
      });
      expect(boundary.challengeAndVerify).not.toHaveBeenCalled();
      expect(boundary.saveCredentials).toHaveBeenCalledExactlyOnceWith(
        current,
        credentials,
        true,
      );
      expect(boundary.query).toHaveBeenCalledExactlyOnceWith(
        "UPDATE users SET mfa_recovery_required=false WHERE id=$1",
        ["account-id"],
      );
      expect(boundary.audit).toHaveBeenCalledExactlyOnceWith(
        req,
        "auth.mfa_verified",
        "account-id",
        "account-id",
        { method: type },
        tx,
      );
      expect(boundary.events).toEqual([
        "saveCredentials",
        "transaction:start",
        "UPDATE users SET mfa_recovery_required=false WHERE id=$1",
        "auth.mfa_verified",
        "transaction:end",
      ]);
    },
  );

  it("uses challengeAndVerify only for TOTP when no challenge ID is supplied", async () => {
    await expect(
      act({ action: "mfa-verify", factorId: "factor", code: "123456" }),
    ).resolves.toHaveProperty("signedIn", true);
    expect(boundary.challengeAndVerify).toHaveBeenCalledExactlyOnceWith({
      factorId: "factor",
      code: "123456",
    });
    expect(boundary.verify).not.toHaveBeenCalled();
  });

  it("requires a challenge ID for phone verification", async () => {
    const current = session();
    current.providerUser.factors = [factor("factor", "phone")];
    await expect(
      act(
        { action: "mfa-verify", factorId: "factor", code: "123456" },
        current,
      ),
    ).rejects.toMatchObject({ status: 400, code: "CHALLENGE_REQUIRED" });
    expectNoMutation();
  });

  it("cannot reuse a previously verified factor while recovery is pending", async () => {
    const current = session();
    current.user.mfaRecoveryRequired = true;
    await expect(
      act(
        { action: "mfa-verify", factorId: "factor", code: "123456" },
        current,
      ),
    ).rejects.toMatchObject({ status: 403, code: "RECOVERY_PENDING" });
    expectNoMutation();
  });

  it.each([true, false])(
    "audits provider verification failures without saving credentials (challenge=%s)",
    async (hasChallenge) => {
      const verify = hasChallenge
        ? boundary.verify
        : boundary.challengeAndVerify;
      verify.mockResolvedValue({ data: null, error: { status: 400 } });
      await expect(
        act({
          action: "mfa-verify",
          factorId: "factor",
          code: "123456",
          ...(hasChallenge ? { challengeId: "challenge" } : {}),
        }),
      ).rejects.toMatchObject({ status: 400, code: "AUTH_FAILED" });
      expect(boundary.audit).toHaveBeenCalledExactlyOnceWith(
        req,
        "auth.mfa_verification_failed",
        "account-id",
      );
      expect(boundary.saveCredentials).not.toHaveBeenCalled();
      expect(boundary.transaction).not.toHaveBeenCalled();
    },
  );

  it("does not clear recovery when credential validation fails", async () => {
    boundary.saveCredentials.mockRejectedValue(
      new ApiError(401, "SESSION_INVALID", "Unit invalid session"),
    );
    await expect(
      act({ action: "mfa-verify", factorId: "factor", code: "123456" }),
    ).rejects.toMatchObject({ code: "SESSION_INVALID" });
    expect(boundary.transaction).not.toHaveBeenCalled();
    expect(boundary.audit).not.toHaveBeenCalled();
  });
});

describe("MFA removal", () => {
  it("allows cancelling the first unverified enrollment with only a fresh primary login", async () => {
    const current = session(false);
    current.privileged = true;
    current.providerUser.factors = [factor("factor", "totp", "unverified")];
    await expect(
      act({ action: "mfa-remove", factorId: "factor" }, current),
    ).resolves.toEqual({ message: "Unverified enrollment cancelled" });
    expect(boundary.unenroll).toHaveBeenCalledExactlyOnceWith({
      factorId: "factor",
    });
    expect(boundary.audit).toHaveBeenCalledExactlyOnceWith(
      req,
      "auth.mfa_removed",
      "account-id",
      "account-id",
      { method: "totp" },
    );
    expect(boundary.revokeSessions).not.toHaveBeenCalled();
  });

  it("requires MFA even to cancel an unverified enrollment when another factor is verified", async () => {
    const current = session();
    current.aal = "aal1";
    current.providerUser.factors!.push(
      factor("pending", "phone", "unverified"),
    );
    await expect(
      act({ action: "mfa-remove", factorId: "pending" }, current),
    ).rejects.toMatchObject({ code: "MFA_REQUIRED" });
    expectNoMutation();
  });

  it("preserves a privileged account's last verified factor even with a pending replacement", async () => {
    const current = session();
    current.privileged = true;
    current.providerUser.factors!.push(
      factor("pending", "phone", "unverified"),
    );
    await expect(
      act({ action: "mfa-remove", factorId: "factor" }, current),
    ).rejects.toMatchObject({ status: 409, code: "PRIVILEGED_MFA_REQUIRED" });
    expectNoMutation();
  });

  it.each([false, true])(
    "revokes all sessions after permitted verified-factor removal (privileged=%s)",
    async (privileged) => {
      const current = session();
      current.privileged = privileged;
      if (privileged)
        current.providerUser.factors!.push(factor("second", "phone"));
      await expect(
        act({ action: "mfa-remove", factorId: "factor" }, current),
      ).resolves.toEqual({
        message: "Factor removed. Sign in again",
        signedOut: true,
      });
      expect(boundary.unenroll).toHaveBeenCalledExactlyOnceWith({
        factorId: "factor",
      });
      expect(boundary.revokeSessions).toHaveBeenCalledExactlyOnceWith(
        req,
        res,
        current,
        true,
      );
      expect(boundary.events).toEqual(["auth.mfa_removed", "revokeSessions"]);
    },
  );

  it("does not audit or revoke sessions when provider removal fails", async () => {
    boundary.unenroll.mockResolvedValue({ data: null, error: { status: 503 } });
    await expect(
      act({ action: "mfa-remove", factorId: "factor" }),
    ).rejects.toMatchObject({ code: "AUTH_PROVIDER_UNAVAILABLE" });
    expect(boundary.audit).not.toHaveBeenCalled();
    expect(boundary.revokeSessions).not.toHaveBeenCalled();
  });
});

describe("recovery code generation and recovery choreography", () => {
  it("requires a verified factor before generating recovery codes", async () => {
    const current = session(false);
    current.aal = "aal2";
    current.row.last_mfa_at = now;
    await expect(
      act({ action: "recovery-codes" }, current),
    ).rejects.toMatchObject({ status: 403, code: "MFA_REQUIRED" });
    expectNoMutation();
  });

  it("returns eight formatted codes but stores only account- and purpose-bound hashes after locking and replacing", async () => {
    const result = await act({ action: "recovery-codes" });
    expect(result).toHaveProperty("recoveryCodes");
    if (!result.recoveryCodes)
      throw new Error("Missing generated recovery codes");
    expect(result.recoveryCodes).toHaveLength(8);
    expect(new Set(result.recoveryCodes).size).toBe(8);
    expect(boundary.transaction).toHaveBeenCalledTimes(1);
    expect(boundary.query).toHaveBeenNthCalledWith(
      1,
      "SELECT id FROM users WHERE id=$1 FOR UPDATE",
      ["account-id"],
    );
    expect(boundary.query).toHaveBeenNthCalledWith(
      2,
      "DELETE FROM auth_recovery_codes WHERE user_id=$1",
      ["account-id"],
    );
    result.recoveryCodes.forEach((code, index) => {
      expect(code).toMatch(/^[a-f0-9]{5}(?:-[a-f0-9]{5}){7}$/);
      const normalized = code.replaceAll("-", "");
      const hash = digest(`account-id:${normalized}`, "recovery");
      expect(hash).not.toBe(digest(`account-id:${normalized}`));
      expect(hash).not.toBe(digest(`other-account:${normalized}`, "recovery"));
      expect(boundary.query).toHaveBeenNthCalledWith(
        index + 3,
        "INSERT INTO auth_recovery_codes(user_id,code_hash) VALUES($1,$2)",
        ["account-id", hash],
      );
      expect(JSON.stringify(boundary.query.mock.calls)).not.toContain(
        normalized,
      );
      expect(JSON.stringify(boundary.query.mock.calls)).not.toContain(code);
    });
    expect(boundary.query).toHaveBeenCalledTimes(10);
    expect(boundary.audit).toHaveBeenCalledExactlyOnceWith(
      req,
      "auth.recovery_codes_generated",
      "account-id",
      "account-id",
      { count: 8 },
      tx,
    );
    expect(boundary.events.slice(-2)).toEqual([
      "auth.recovery_codes_generated",
      "transaction:end",
    ]);
  });

  it("rejects rather than returning codes when a storage insertion fails", async () => {
    boundary.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(new Error("unit storage failure"));
    await expect(act({ action: "recovery-codes" })).rejects.toThrow(
      "unit storage failure",
    );
    expect(boundary.query).toHaveBeenCalledTimes(3);
    expect(boundary.audit).not.toHaveBeenCalled();
  });

  it("consumes a normalized code and revokes local access before provider deletion and cleanup", async () => {
    const current = session();
    current.aal = "aal1"; // Recovery is primary-authenticated, not a claim of native AAL2.
    current.providerUser.factors!.push(
      factor("phone-factor", "phone", "unverified"),
    );
    boundary.query.mockResolvedValueOnce({ rows: [{ id: "accepted-code" }] });
    await expect(
      act({ action: "recover-mfa", code: recoveryCode }, current),
    ).resolves.toEqual({
      message:
        "Sign in and enroll a new security factor. Account access remains restricted until verification",
      signedOut: true,
    });
    expect(boundary.authLimit.mock.calls).toEqual([
      [req, "mfa", "account-id", 10, 600],
      [req, "mfa-recovery", "account-id", 5, 900],
    ]);
    expect(boundary.query).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(
        /UPDATE auth_recovery_codes SET used_at=now\(\)[\s\S]*WHERE user_id=\$1 AND code_hash=\$2 AND used_at IS NULL RETURNING id/,
      ),
      [
        "account-id",
        digest(
          `account-id:${recoveryCode.toLowerCase().replaceAll("-", "")}`,
          "recovery",
        ),
      ],
    );
    expect(boundary.query).toHaveBeenNthCalledWith(
      2,
      "UPDATE users SET mfa_recovery_required=true WHERE id=$1",
      ["account-id"],
    );
    expect(boundary.query).toHaveBeenNthCalledWith(
      3,
      "UPDATE sessions SET revoked_at=now(),encrypted_credentials=NULL WHERE user_id=$1",
      ["account-id"],
    );
    expect(clearCookie).toHaveBeenCalledExactlyOnceWith("__Host-ps-session", {
      httpOnly: true,
      secure: true,
      path: "/",
      sameSite: "none",
    });
    expect(boundary.deleteFactor.mock.calls).toEqual([
      [{ id: "factor", userId: "provider-id" }],
      [{ id: "phone-factor", userId: "provider-id" }],
    ]);
    expect(boundary.query).toHaveBeenNthCalledWith(
      4,
      "DELETE FROM auth_recovery_codes WHERE user_id=$1",
      ["account-id"],
    );
    expect(boundary.query).toHaveBeenNthCalledWith(
      5,
      "INSERT INTO notifications(user_id,title,body) VALUES($1,$2,$3)",
      [
        "account-id",
        "MFA account recovery",
        "Your security factors were reset using a recovery code. All sessions are revoked. Sign in and enroll a new factor.",
      ],
    );
    expect(boundary.audit.mock.calls).toEqual([
      [req, "auth.mfa_recovery_started", "account-id", "account-id", {}, tx],
      [req, "auth.mfa_recovered", "account-id", "account-id", {}, tx],
    ]);
    expect(boundary.events).toEqual([
      "transaction:start",
      "UPDATE users SET mfa_recovery_required=true WHERE id=$1",
      "UPDATE sessions SET revoked_at=now(),encrypted_credentials=NULL WHERE user_id=$1",
      "auth.mfa_recovery_started",
      "transaction:end",
      "clearCookie",
      "delete:factor",
      "delete:phone-factor",
      "transaction:start",
      "DELETE FROM auth_recovery_codes WHERE user_id=$1",
      "INSERT INTO notifications(user_id,title,body) VALUES($1,$2,$3)",
      "auth.mfa_recovered",
      "transaction:end",
      "revokeSessions",
    ]);
    expect(boundary.transaction).toHaveBeenCalledTimes(2);
    expect(boundary.revokeSessions).toHaveBeenCalledExactlyOnceWith(
      req,
      res,
      current,
      true,
    );
    expect(boundary.saveCredentials).not.toHaveBeenCalled();
  });

  it("rejects invalid or already-used codes without provider or cookie changes", async () => {
    await expect(
      act({ action: "recover-mfa", code: recoveryCode }),
    ).rejects.toMatchObject({ status: 400, code: "RECOVERY_CODE_INVALID" });
    expect(boundary.query).toHaveBeenCalledTimes(1);
    expect(boundary.transaction).toHaveBeenCalledTimes(1);
    expect(boundary.audit).not.toHaveBeenCalled();
    expect(boundary.deleteFactor).not.toHaveBeenCalled();
    expect(clearCookie).not.toHaveBeenCalled();
    expect(boundary.revokeSessions).not.toHaveBeenCalled();
  });

  it("stops recovery before consuming a code when the dedicated limiter rejects", async () => {
    boundary.authLimit
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(
        new ApiError(429, "AUTH_RATE_LIMITED", "Unit recovery limit"),
      );
    await expect(
      act({ action: "recover-mfa", code: recoveryCode }),
    ).rejects.toMatchObject({ status: 429, code: "AUTH_RATE_LIMITED" });
    expectNoMutation();
  });

  it("does not clear the cookie or delete factors when the local recovery transaction rejects", async () => {
    boundary.query
      .mockResolvedValueOnce({ rows: [{ id: "accepted-code" }] })
      .mockRejectedValueOnce(new Error("unit recovery write failure"));
    await expect(
      act({ action: "recover-mfa", code: recoveryCode }),
    ).rejects.toThrow("unit recovery write failure");
    expect(clearCookie).not.toHaveBeenCalled();
    expect(boundary.deleteFactor).not.toHaveBeenCalled();
    expect(boundary.revokeSessions).not.toHaveBeenCalled();
  });

  it("surfaces factor-deletion failure after local revocation without claiming recovery completion", async () => {
    boundary.query.mockResolvedValueOnce({ rows: [{ id: "accepted-code" }] });
    boundary.deleteFactor.mockResolvedValue({
      data: null,
      error: { status: 503 },
    });
    await expect(
      act({ action: "recover-mfa", code: recoveryCode }),
    ).rejects.toMatchObject({ status: 503, code: "AUTH_PROVIDER_UNAVAILABLE" });
    expect(clearCookie).toHaveBeenCalledTimes(1);
    expect(boundary.query).toHaveBeenCalledTimes(3);
    expect(boundary.transaction).toHaveBeenCalledTimes(1);
    expect(boundary.audit).toHaveBeenCalledExactlyOnceWith(
      req,
      "auth.mfa_recovery_started",
      "account-id",
      "account-id",
      {},
      tx,
    );
    expect(boundary.revokeSessions).not.toHaveBeenCalled();
  });

  it("surfaces final session-revocation failure rather than returning signedOut success", async () => {
    boundary.query.mockResolvedValueOnce({ rows: [{ id: "accepted-code" }] });
    boundary.revokeSessions.mockRejectedValue(
      new Error("unit revocation failure"),
    );
    await expect(
      act({ action: "recover-mfa", code: recoveryCode }),
    ).rejects.toThrow("unit revocation failure");
    expect(boundary.transaction).toHaveBeenCalledTimes(2);
    expect(boundary.audit).toHaveBeenLastCalledWith(
      req,
      "auth.mfa_recovered",
      "account-id",
      "account-id",
      {},
      tx,
    );
  });

  it("does not report recovery complete when cleanup fails after provider deletion", async () => {
    boundary.query
      .mockResolvedValueOnce({ rows: [{ id: "accepted-code" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(new Error("unit cleanup failure"));
    await expect(
      act({ action: "recover-mfa", code: recoveryCode }),
    ).rejects.toThrow("unit cleanup failure");
    expect(boundary.deleteFactor).toHaveBeenCalledExactlyOnceWith({
      id: "factor",
      userId: "provider-id",
    });
    expect(boundary.transaction).toHaveBeenCalledTimes(2);
    expect(boundary.audit).toHaveBeenCalledExactlyOnceWith(
      req,
      "auth.mfa_recovery_started",
      "account-id",
      "account-id",
      {},
      tx,
    );
    expect(boundary.revokeSessions).not.toHaveBeenCalled();
  });

  it("rejects unsupported actions defensively after the common session and rate gate", async () => {
    await expect(
      act({ action: "unsupported" } as unknown as MfaInput),
    ).rejects.toMatchObject({ status: 400, code: "INVALID_ACTION" });
    expectNoMutation();
  });
});
