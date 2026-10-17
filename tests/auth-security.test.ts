import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  digest,
  seal,
  unseal,
  signedNonce,
  validNonce,
  opaqueHandle,
} from "../artifacts/api-server/src/lib/auth-crypto";
import { authActionSchema } from "../artifacts/api-server/src/services/auth-input";
import {
  assertPlatformManagement,
  assertLastOwner,
  assertLastSuperAdmin,
} from "../artifacts/api-server/src/services/auth-policy";
import {
  requireAccount,
  requireFresh,
  type AccountUser,
  type AuthSession,
} from "../artifacts/api-server/src/services/auth-sessions";

beforeEach(() =>
  vi.stubEnv(
    "SESSION_SECRET",
    "unit-test-only-key-with-at-least-32-characters",
  ),
);
afterEach(() => vi.unstubAllEnvs());
const actor = (role: AccountUser["platformRole"], id = "actor") =>
  ({ id, platformRole: role, status: "active" }) as AccountUser;
describe("auth cryptographic boundaries", () => {
  it("encrypts credentials with a purpose-bound authenticated envelope", () => {
    const secret = { value: "unit-test-provider-credential" };
    const encrypted = seal(secret);
    expect(encrypted).not.toContain(secret.value);
    expect(unseal(encrypted)).toEqual(secret);
    expect(() => unseal(encrypted, "flow")).toThrow();
    const parts = encrypted.split(".");
    parts[2] = Buffer.from("tampered").toString("base64url");
    expect(() => unseal(parts.join("."))).toThrow();
  });
  it("rejects forged CSRF tokens and separates keyed lookup purposes", () => {
    const nonce = signedNonce();
    expect(validNonce(nonce)).toBe(true);
    expect(validNonce(nonce.slice(0, -2) + "zz")).toBe(false);
    expect(validNonce("forged")).toBe(false);
    const handle = opaqueHandle();
    expect(handle).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(digest(handle)).not.toEqual(digest(handle, "flow"));
  });
  it.each([4, 8, 12])(
    "rejects a shortened %s-byte authentication tag",
    (length) => {
      const parts = seal({ value: "isolated credential fixture" }).split(".");
      parts[1] = Buffer.from(parts[1], "base64url")
        .subarray(0, length)
        .toString("base64url");
      expect(() => unseal(parts.join("."))).toThrow();
    },
  );
  it("rejects noncanonical transport instead of ignoring invalid base64url characters", () => {
    const parts = seal({ value: "isolated credential fixture" }).split(".");
    for (let index = 0; index < parts.length; index++) {
      const changed = [...parts];
      changed[index] += "!";
      expect(() => unseal(changed.join("."))).toThrow();
    }
  });
  it.each([0, 11, 13])("rejects a %s-byte IV", (length) => {
    const parts = seal({ value: "isolated credential fixture" }).split(".");
    parts[0] = Buffer.alloc(length).toString("base64url");
    expect(() => unseal(parts.join("."))).toThrow(
      "Invalid encrypted credential envelope",
    );
  });
  it("rejects padding even when the decoder accepts the same tag bytes", () => {
    const parts = seal({ value: "isolated credential fixture" }).split(".");
    const tag = parts[1];
    parts[1] += "==";
    expect(Buffer.from(parts[1], "base64url")).toEqual(
      Buffer.from(tag, "base64url"),
    );
    expect(() => unseal(parts.join("."))).toThrow(
      "Invalid encrypted credential envelope",
    );
  });
  it("rejects nonzero pad-bit aliases of an otherwise valid authentication tag", () => {
    const alphabet =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const parts = seal({ value: "isolated credential fixture" }).split(".");
    const tag = parts[1];
    const last = alphabet.indexOf(tag.at(-1)!);
    parts[1] = tag.slice(0, -1) + alphabet[last + 1];
    expect(parts[1]).not.toBe(tag);
    expect(Buffer.from(parts[1], "base64url")).toEqual(
      Buffer.from(tag, "base64url"),
    );
    expect(() => unseal(parts.join("."))).toThrow(
      "Invalid encrypted credential envelope",
    );
  });
  it.each(["", "A"])("rejects a zero-byte ciphertext segment %j", (segment) => {
    const parts = seal({ value: "isolated credential fixture" }).split(".");
    parts[2] = segment;
    expect(Buffer.from(segment, "base64url")).toHaveLength(0);
    expect(() => unseal(parts.join("."))).toThrow(
      "Invalid encrypted credential envelope",
    );
  });
  it.each([undefined, null, 42, {}, []])(
    "rejects a non-string CSRF token %j without coercion",
    (value) => {
      expect(validNonce(value)).toBe(false);
    },
  );
  it("fails closed when session encryption is unconfigured", () => {
    vi.stubEnv("SESSION_SECRET", "");
    expect(() => seal({})).toThrow();
  });
});
describe("strict signup and privilege input", () => {
  const signup = {
    action: "signup",
    email: "dev@example.test",
    password: "Test-only-password123!",
    displayName: "Unit account",
    kind: "developer",
  };
  it("accepts only unprivileged profile categories", () => {
    expect(authActionSchema.safeParse(signup).success).toBe(true);
    expect(
      authActionSchema.safeParse({ ...signup, kind: "super_admin" }).success,
    ).toBe(false);
    expect(
      authActionSchema.safeParse({ ...signup, role: "super_admin" }).success,
    ).toBe(false);
    expect(
      authActionSchema.safeParse({ ...signup, platformRole: "admin" }).success,
    ).toBe(false);
  });
  it("enforces password byte limits and international phone formats", () => {
    expect(
      authActionSchema.safeParse({ ...signup, password: "short" }).success,
    ).toBe(false);
    expect(
      authActionSchema.safeParse({ ...signup, password: "界".repeat(25) })
        .success,
    ).toBe(false);
    expect(
      authActionSchema.safeParse({ action: "phone-otp", phone: "9876543210" })
        .success,
    ).toBe(false);
    expect(
      authActionSchema.safeParse({
        action: "phone-otp",
        phone: "+919876543210",
      }).success,
    ).toBe(true);
  });
});
describe("privilege and owner protection", () => {
  it("denies standard accounts, self-management and moderator role grants", () => {
    expect(() =>
      assertPlatformManagement(actor(null), actor(null, "target")),
    ).toThrow();
    expect(() =>
      assertPlatformManagement(actor("super_admin"), actor("super_admin")),
    ).toThrow();
    expect(() =>
      assertPlatformManagement(
        actor("moderator"),
        actor(null, "target"),
        "moderator",
      ),
    ).toThrow();
    expect(() =>
      assertPlatformManagement(actor("moderator"), actor("admin", "target")),
    ).toThrow();
    expect(() =>
      assertPlatformManagement(actor("moderator"), actor(null, "target")),
    ).not.toThrow();
  });
  it("reserves administrator management for Super Admin", () => {
    expect(() =>
      assertPlatformManagement(
        actor("admin"),
        actor(null, "target"),
        "super_admin",
      ),
    ).toThrow();
    expect(() =>
      assertPlatformManagement(actor("admin"), actor("admin", "target"), null),
    ).toThrow();
    expect(() =>
      assertPlatformManagement(
        actor("admin"),
        actor(null, "target"),
        "moderator",
      ),
    ).not.toThrow();
    expect(() =>
      assertPlatformManagement(
        actor("super_admin"),
        actor("admin", "target"),
        null,
      ),
    ).not.toThrow();
  });
  it("keeps the final owner and active Super Admin", () => {
    expect(() =>
      assertLastOwner("organization_owner", "organization_admin", 1),
    ).toThrow();
    expect(() =>
      assertLastOwner("organization_owner", "organization_admin", 2),
    ).not.toThrow();
    expect(() => assertLastSuperAdmin(actor("super_admin"), true, 1)).toThrow();
    expect(() =>
      assertLastSuperAdmin(actor("super_admin"), false, 1),
    ).not.toThrow();
  });
});
describe("provider assurance gates", () => {
  const session = () =>
    ({
      user: { mfaRecoveryRequired: false },
      mfaRequired: true,
      providerUser: {
        factors: [{ id: "factor", factor_type: "totp", status: "verified" }],
      },
      aal: "aal1",
      row: { created_at: new Date(), last_mfa_at: new Date() },
    }) as AuthSession;
  it("does not let a primary login impersonate provider AAL2", () => {
    expect(() => requireAccount(session())).toThrow();
    expect(() => requireAccount({ ...session(), aal: "aal2" })).not.toThrow();
  });
  it("blocks recovery-in-progress even with an old AAL2 token", () => {
    expect(() =>
      requireAccount({
        ...session(),
        aal: "aal2",
        user: { ...session().user, mfaRecoveryRequired: true },
      }),
    ).toThrow();
  });
  it("rejects old AAL2 assurance when the native factor no longer exists", () => {
    const stale = {
      ...session(),
      aal: "aal2",
      providerUser: { ...session().providerUser, factors: [] },
    };
    expect(() => requireAccount(stale)).toThrow();
    expect(() => requireFresh(stale, true)).toThrow();
  });
  it("requires a fresh native MFA verification for sensitive changes", () => {
    expect(() => requireFresh(session(), true)).toThrow();
    expect(() =>
      requireFresh({ ...session(), aal: "aal2" }, true),
    ).not.toThrow();
    expect(() =>
      requireFresh(
        {
          ...session(),
          aal: "aal2",
          row: { ...session().row, last_mfa_at: new Date(0) },
        },
        true,
      ),
    ).toThrow();
  });
});
