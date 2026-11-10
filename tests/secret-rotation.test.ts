import { afterEach, describe, expect, it, vi } from "vitest";
import {
  seal,
  signedNonce,
  unseal,
  validNonce,
} from "../artifacts/api-server/src/lib/auth-crypto";

const oldSecret = "o".repeat(40);
const newSecret = "n".repeat(40);
const tokenSecret = "t".repeat(40);

describe("secret rotation", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("keeps sealed values readable through SESSION_SECRET_PREVIOUS", () => {
    vi.stubEnv("SESSION_SECRET", oldSecret);
    const sealed = seal({ a: 1 }, "flow");
    const nonce = signedNonce();
    vi.stubEnv("SESSION_SECRET", newSecret);
    expect(() => unseal(sealed, "flow")).toThrow();
    expect(validNonce(nonce)).toBe(false);
    vi.stubEnv("SESSION_SECRET_PREVIOUS", oldSecret);
    expect(unseal(sealed, "flow")).toEqual({ a: 1 });
    expect(validNonce(nonce)).toBe(true);
    expect(validNonce(signedNonce())).toBe(true);
  });

  it("seals GitHub tokens with their own secret, still reading older ones", () => {
    vi.stubEnv("SESSION_SECRET", oldSecret);
    const before = seal("gho_old", "github-token");
    vi.stubEnv("GITHUB_TOKEN_SECRET", tokenSecret);
    const after = seal("gho_new", "github-token");
    expect(unseal(before, "github-token")).toBe("gho_old");
    expect(unseal(after, "github-token")).toBe("gho_new");
    // The session secret alone no longer opens new tokens.
    vi.stubEnv("GITHUB_TOKEN_SECRET", "");
    expect(() => unseal(after, "github-token")).toThrow();
  });
});
