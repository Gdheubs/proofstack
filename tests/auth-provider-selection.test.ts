import { afterEach, describe, expect, it, vi } from "vitest";
import {
  capabilities,
  providerClient,
} from "../artifacts/api-server/src/services/auth-provider";

afterEach(() => vi.unstubAllEnvs());

describe("authentication provider selection", () => {
  it("rejects an unknown provider instead of falling back to Supabase", async () => {
    vi.stubEnv("AUTH_PROVIDER", "unknown-provider");
    await expect(capabilities()).rejects.toMatchObject({
      status: 503,
      code: "AUTH_CONFIGURATION_REQUIRED",
      message: "Unsupported authentication provider",
    });
  });

  it("does not send Firebase authentication through the legacy Supabase client", () => {
    vi.stubEnv("AUTH_PROVIDER", "firebase");
    expect(() => providerClient()).toThrowError(
      "This sign-in method is not available",
    );
  });

  it("never promises Firebase MFA enrollment merely from an environment flag", async () => {
    for (const [name, value] of Object.entries({
      AUTH_PROVIDER: "firebase",
      FIREBASE_PROJECT_ID: "test-firebase-project",
      FIREBASE_WEB_PROJECT_ID: "test-firebase-project",
      FIREBASE_WEB_API_KEY: "public-test-key",
      FIREBASE_WEB_AUTH_DOMAIN: "test-firebase-project.firebaseapp.com",
      FIREBASE_WEB_APP_ID: "test-web-app",
      FIREBASE_TOTP_ENABLED: "true",
    }))
      vi.stubEnv(name, value);
    const available = await capabilities();
    expect(available.totp).toBe(false);
    expect(available.pendingSetup).toContain(
      "Firebase authenticator enrollment",
    );
  });
  it("offers configured Firebase social sign-in without Supabase credentials", async () => {
    const config = {
      AUTH_PROVIDER: "firebase",
      FIREBASE_PROJECT_ID: "test-firebase-project",
      FIREBASE_WEB_PROJECT_ID: "test-firebase-project",
      FIREBASE_WEB_API_KEY: "unit-test-public-web-config",
      FIREBASE_WEB_AUTH_DOMAIN: "test-firebase-project.firebaseapp.com",
      FIREBASE_WEB_APP_ID: "unit-test-web-app",
      FIREBASE_GOOGLE_ENABLED: "true",
      FIREBASE_GITHUB_ENABLED: "true",
      FIREBASE_TOTP_ENABLED: "false",
    };
    for (const [name, value] of Object.entries(config)) vi.stubEnv(name, value);
    await expect(capabilities()).resolves.toMatchObject({
      password: false,
      emailOtp: false,
      phoneOtp: false,
      google: true,
      github: true,
      totp: false,
      phoneMfa: false,
    });
  });
});
