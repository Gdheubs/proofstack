import { describe, expect, it, vi } from "vitest";

const ui = vi.hoisted(() => ({
  session: {
    isLoading: false,
    isError: false,
    error: null as Error | null,
    data: { csrfToken: "csrf", authenticated: false, mfaRequired: false },
    refetch: vi.fn(),
  },
  replace: vi.fn(),
  act: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("../artifacts/proofstack/hooks/use-auth", () => ({
  useSession: () => ui.session,
  useAct: () => ({ act: ui.act, refresh: ui.refresh }),
  errInfo: (error: unknown) => ({
    message: error instanceof Error ? error.message : "Request failed.",
  }),
}));

async function renderFirebaseView() {
  const { BrowserFirebaseAuth } = await load();
  const root = `${process.cwd()}/artifacts/proofstack/node_modules`;
  const { createElement } = await import(`${root}/react/index.js`);
  const { renderToStaticMarkup } = await import(
    `${root}/react-dom/server.node.js`
  );
  const { AppRouterContext } = await import(
    `${root}/next/dist/shared/lib/app-router-context.shared-runtime.js`
  );
  return renderToStaticMarkup(
    createElement(
      AppRouterContext.Provider,
      { value: { replace: ui.replace } },
      createElement(BrowserFirebaseAuth, { config: publicConfig }),
    ),
  );
}

describe("provider-selection UI", () => {
  it.each([
    [{ isPending: true, isError: false }, "Loading sign-in options", false],
    [
      {
        isPending: false,
        isError: true,
        error: new Error("configuration offline"),
        data: { provider: "supabase" },
      },
      "configuration offline",
      false,
    ],
    [
      { isPending: false, isError: false },
      "Authentication configuration",
      false,
    ],
    [
      { isPending: false, isError: false, data: { provider: "supabase" } },
      "Legacy login",
      true,
    ],
  ])(
    "selects legacy only from a settled explicit Supabase response (%s)",
    async (query, message, legacy) => {
      const { BrowserAuthSelection } = await load();
      const root = `${process.cwd()}/artifacts/proofstack/node_modules`;
      const { createElement } = await import(`${root}/react/index.js`);
      const { renderToStaticMarkup } = await import(
        `${root}/react-dom/server.node.js`
      );
      const html = renderToStaticMarkup(
        createElement(BrowserAuthSelection, {
          query: { ...query, refetch: vi.fn() },
          legacy: createElement("p", null, "Legacy login"),
        }),
      );
      expect(html).toContain(message);
      if (!legacy) expect(html).not.toContain("Legacy login");
    },
  );
});

describe("Firebase sign-in view", () => {
  it("offers Google and GitHub, not legacy password or MFA enrollment forms", async () => {
    const html = await renderFirebaseView();
    expect(html).toContain("Continue with Google");
    expect(html).toContain("Continue with GitHub");
    expect(html).toContain("pending setup");
    expect(html).not.toContain("Email code");
    expect(html).not.toContain('type="password"');
    expect(html).not.toContain("Backup code");
  });
  it("keeps native MFA enrollment pending and privileged access blocked", async () => {
    ui.session.data = {
      csrfToken: "csrf",
      authenticated: true,
      mfaRequired: true,
    };
    try {
      const html = await renderFirebaseView();
      expect(html).toContain("Native MFA enrollment is pending");
      expect(html).toContain("Privileged access remains blocked");
      expect(html).toContain("Sign out");
      expect(html).not.toContain("Backup code");
      expect(html).not.toContain("Scan");
    } finally {
      ui.session.data = {
        csrfToken: "csrf",
        authenticated: false,
        mfaRequired: false,
      };
    }
  });
});

// Dynamic path keeps the root Node test tsconfig independent of Next's JSX config.
const browserModule = `${process.cwd()}/artifacts/proofstack/features/auth/browser-firebase-auth.tsx`;
const load = () => import(browserModule);

it("initializes a dedicated Firebase app with memory-only persistence and a popup resolver", async () => {
  const { createFirebaseBrowserClient } = await load();
  const app = { name: "proofstack-browser" };
  const auth = { name: "memory-auth" };
  const sdk = {
    initializeApp: vi.fn(() => app),
    initializeAuth: vi.fn(() => auth),
    inMemoryPersistence: { type: "NONE" },
    browserPopupRedirectResolver: "popup-resolver",
  };
  const client = await createFirebaseBrowserClient(publicConfig, sdk);
  expect(sdk.initializeApp).toHaveBeenCalledWith(
    publicConfig.firebase,
    "proofstack-browser",
  );
  expect(sdk.initializeAuth).toHaveBeenCalledWith(app, {
    persistence: sdk.inMemoryPersistence,
    popupRedirectResolver: sdk.browserPopupRedirectResolver,
  });
  expect(client.auth).toBe(auth);
});
describe("native Firebase popup sign-in", () => {
  it.each(["google", "github"])(
    "uses the selected %s provider and returns only the signed-in user",
    async (provider) => {
      const { startFirebasePopup } = await load();
      class GoogleAuthProvider {}
      class GithubAuthProvider {}
      const user = { uid: "user" };
      const sdk = {
        GoogleAuthProvider,
        GithubAuthProvider,
        signInWithPopup: vi.fn(async () => ({
          user,
          credential: { accessToken: "never-return" },
        })),
      };
      const client = { auth: {}, sdk };
      expect(await startFirebasePopup(client, provider)).toEqual({
        kind: "user",
        user,
      });
      expect(sdk.signInWithPopup).toHaveBeenCalledWith(
        client.auth,
        expect.any(
          provider === "google" ? GoogleAuthProvider : GithubAuthProvider,
        ),
      );
    },
  );
  it("keeps the native MFA resolver in memory without handing off first-factor identity", async () => {
    const { startFirebasePopup } = await load();
    const error = { code: "auth/multi-factor-auth-required" };
    const resolver = { hints: [{ factorId: "totp", uid: "factor" }] };
    const client = {
      auth: {},
      sdk: {
        GoogleAuthProvider: class {},
        signInWithPopup: vi.fn(async () => {
          throw error;
        }),
        getMultiFactorResolver: vi.fn(() => resolver),
        signOut: vi.fn(),
      },
    };
    expect(await startFirebasePopup(client, "google")).toEqual({
      kind: "challenge",
      resolver,
    });
    expect(client.sdk.getMultiFactorResolver).toHaveBeenCalledWith(
      client.auth,
      error,
    );
    expect(client.sdk.signOut).not.toHaveBeenCalled();
  });
  it("clears SDK state after a popup error without retaining or linking provider credentials", async () => {
    const { startFirebasePopup } = await load();
    const error = {
      code: "auth/account-exists-with-different-credential",
      credential: { accessToken: "never-retain" },
    };
    const client = {
      auth: {},
      sdk: {
        GithubAuthProvider: class {},
        signInWithPopup: vi.fn(async () => {
          throw error;
        }),
        signOut: vi.fn(async () => {}),
      },
    };
    await expect(startFirebasePopup(client, "github")).rejects.toBe(error);
    expect(client.sdk.signOut).toHaveBeenCalledWith(client.auth);
  });
});

describe("native Firebase TOTP challenge", () => {
  it("resolves the explicitly selected enrolled TOTP factor with the native SDK assertion", async () => {
    const { resolveFirebaseTotp } = await load();
    const assertion = { factor: "native" };
    const credential = { user: { getIdToken: vi.fn() } };
    const resolver = {
      hints: [
        { uid: "sms", factorId: "phone" },
        { uid: "totp-two", factorId: "totp" },
      ],
      resolveSignIn: vi.fn(async () => credential),
    };
    const client = {
      sdk: {
        TotpMultiFactorGenerator: {
          FACTOR_ID: "totp",
          assertionForSignIn: vi.fn(() => assertion),
        },
      },
    };
    expect(
      await resolveFirebaseTotp(client, resolver, "totp-two", "123456"),
    ).toBe(credential.user);
    expect(
      client.sdk.TotpMultiFactorGenerator.assertionForSignIn,
    ).toHaveBeenCalledWith("totp-two", "123456");
    expect(resolver.resolveSignIn).toHaveBeenCalledWith(assertion);
    expect(credential.user.getIdToken).not.toHaveBeenCalled();
  });
  it.each([
    ["sms", "123456"],
    ["unknown", "123456"],
    ["totp", "12345"],
    ["totp", "abcdef"],
  ])(
    "rejects unsupported factors or invalid codes (%s/%s) without resolving",
    async (uid, code) => {
      const { resolveFirebaseTotp } = await load();
      const resolver = {
        hints: [
          { uid: "sms", factorId: "phone" },
          { uid: "totp", factorId: "totp" },
        ],
        resolveSignIn: vi.fn(),
      };
      const client = {
        sdk: {
          TotpMultiFactorGenerator: {
            FACTOR_ID: "totp",
            assertionForSignIn: vi.fn(),
          },
        },
      };
      await expect(
        resolveFirebaseTotp(client, resolver, uid, code),
      ).rejects.toThrow();
      expect(resolver.resolveSignIn).not.toHaveBeenCalled();
      expect(
        client.sdk.TotpMultiFactorGenerator.assertionForSignIn,
      ).not.toHaveBeenCalled();
    },
  );
});

describe("Firebase sign-in errors", () => {
  it.each([
    [
      "auth/account-exists-with-different-credential",
      "Sign in with the provider you originally used. Accounts are not linked automatically.",
      false,
    ],
    [
      "auth/popup-blocked",
      "Your browser blocked the sign-in popup. Allow popups, or open this app in its own tab and try again.",
      true,
    ],
    [
      "auth/popup-closed-by-user",
      "Sign-in was cancelled. Choose a provider to try again.",
      false,
    ],
    [
      "auth/invalid-verification-code",
      "That authenticator code is invalid or expired. Enter a fresh code.",
      false,
    ],
    [
      "auth/invalid-multi-factor-session",
      "The second-factor challenge expired. Start sign-in again.",
      false,
    ],
    [
      "auth/network-request-failed",
      "Could not reach the sign-in provider. Check your connection and try again.",
      false,
    ],
    [
      "auth/unauthorized-domain",
      "Sign-in is not configured for this app domain. Contact the administrator.",
      false,
    ],
    [
      "auth/unrecognized",
      "Sign-in could not be completed. Try again or contact the administrator.",
      false,
    ],
  ])(
    "explains %s without displaying sensitive SDK error details",
    async (code, message, openInNewTab) => {
      const { firebaseSignInProblem } = await load();
      expect(
        firebaseSignInProblem({ code, message: "sensitive-provider-token" }),
      ).toEqual({ message, openInNewTab });
    },
  );
});

describe("provider configuration requests", () => {
  it("fetches same-origin uncached config and never converts failed requests to legacy selection", async () => {
    const { fetchBrowserAuthConfig } = await load();
    const controller = new AbortController();
    const request = vi.fn(
      async () => new Response(JSON.stringify({ provider: "supabase" })),
    );
    expect(await fetchBrowserAuthConfig(controller.signal, request)).toEqual({
      provider: "supabase",
    });
    expect(request).toHaveBeenCalledWith("/api/auth/firebase/config", {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    });
    await expect(
      fetchBrowserAuthConfig(
        undefined,
        async () => new Response("offline", { status: 503 }),
      ),
    ).rejects.toThrow("Authentication configuration");
    await expect(
      fetchBrowserAuthConfig(undefined, async () => {
        throw new Error("network unavailable");
      }),
    ).rejects.toThrow("network unavailable");
  });
});

const publicConfig = {
  provider: "firebase",
  firebase: {
    apiKey: "public-key",
    authDomain: "proofstack-6acec.firebaseapp.com",
    projectId: "proofstack-6acec",
    appId: "public-app-id",
  },
  providers: { google: true, github: false },
};

describe("browser Firebase provider selection", () => {
  it("accepts only explicit Supabase selection or an allowlisted Firebase config", async () => {
    const { parseBrowserAuthConfig } = await load();
    expect(parseBrowserAuthConfig({ provider: "supabase" })).toEqual({
      provider: "supabase",
    });
    expect(
      parseBrowserAuthConfig({
        ...publicConfig,
        firebase: {
          ...publicConfig.firebase,
          clientSecret: "must-not-propagate",
        },
        credentials: "must-not-propagate",
      }),
    ).toEqual(publicConfig);
    for (const value of [
      null,
      {},
      { provider: "unknown" },
      { provider: "firebase" },
      {
        ...publicConfig,
        firebase: { ...publicConfig.firebase, apiKey: "" },
      },
      { ...publicConfig, providers: { google: "true", github: false } },
    ]) {
      expect(() => parseBrowserAuthConfig(value)).toThrow(
        "Authentication configuration",
      );
    }
  });
});

describe("Firebase server-session handoff", () => {
  it("fails closed without CSRF, even when cleanup fails", async () => {
    const { handoffFirebaseSession } = await load();
    const request = vi.fn();
    const getIdToken = vi.fn();
    const clear = vi.fn(async () => {
      throw new Error("cleanup failed");
    });
    await expect(
      handoffFirebaseSession({
        user: { getIdToken },
        csrfToken: "",
        request,
        clear,
        refresh: vi.fn(),
      }),
    ).rejects.toThrow("Security token");
    expect(getIdToken).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
    expect(clear).toHaveBeenCalledOnce();
  });
  it("preserves a server rejection when clearing SDK state also fails", async () => {
    const { handoffFirebaseSession } = await load();
    const refresh = vi.fn();
    await expect(
      handoffFirebaseSession({
        user: { getIdToken: async () => "id" },
        csrfToken: "csrf",
        request: async () =>
          new Response(
            JSON.stringify({ error: { message: "MFA required by server" } }),
            { status: 403 },
          ),
        clear: async () => {
          throw new Error("cleanup failed");
        },
        refresh,
      }),
    ).rejects.toThrow("MFA required by server");
    expect(refresh).not.toHaveBeenCalled();
  });
  it("refreshes identity caches after a confirmed handoff even if SDK cleanup fails", async () => {
    const { handoffFirebaseSession } = await load();
    const refresh = vi.fn(async () => {});
    await expect(
      handoffFirebaseSession({
        user: { getIdToken: async () => "id" },
        csrfToken: "csrf",
        request: async () => new Response(JSON.stringify({ signedIn: true })),
        clear: async () => {
          throw new Error("cleanup failed");
        },
        refresh,
      }),
    ).rejects.toThrow("cleanup failed");
    expect(refresh).toHaveBeenCalledWith(true);
  });
  it.each([
    [
      403,
      {
        error: {
          code: "CSRF_INVALID",
          message: "Security token expired. Reload and retry.",
        },
      },
      "Security token expired",
    ],
    [200, { signedIn: false }, "did not confirm"],
    [200, { message: "Signed in" }, "did not confirm"],
    [503, "not JSON", "Session request failed (503)"],
  ])(
    "rejects an unconfirmed or failed handoff (%s), clears SDK state and never refreshes",
    async (status, payload, message) => {
      const { handoffFirebaseSession } = await load();
      const clear = vi.fn(async () => {});
      const refresh = vi.fn(async () => {});
      const request = vi.fn(
        async () =>
          new Response(
            typeof payload === "string" ? payload : JSON.stringify(payload),
            { status },
          ),
      );
      await expect(
        handoffFirebaseSession({
          user: { getIdToken: async () => "id" },
          csrfToken: "csrf",
          request,
          clear,
          refresh,
        }),
      ).rejects.toThrow(message);
      expect(clear).toHaveBeenCalledOnce();
      expect(refresh).not.toHaveBeenCalled();
    },
  );
  it("hands off only a fresh Firebase ID token with same-origin cookies and CSRF, then clears SDK state before refreshing identity caches", async () => {
    const { handoffFirebaseSession } = await load();
    const order: string[] = [];
    const getIdToken = vi.fn(async () => "firebase-id-token");
    const request = vi.fn(async () => {
      order.push("server");
      return new Response(
        JSON.stringify({ message: "Signed in", signedIn: true }),
      );
    });
    const clear = vi.fn(async () => {
      order.push("clear");
    });
    const refresh = vi.fn(async () => {
      order.push("refresh");
    });
    await handoffFirebaseSession({
      user: { getIdToken },
      csrfToken: "csrf",
      request,
      clear,
      refresh,
    });
    expect(getIdToken).toHaveBeenCalledWith(true);
    expect(request).toHaveBeenCalledWith("/api/auth/firebase/session", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": "csrf" },
      body: JSON.stringify({ idToken: "firebase-id-token" }),
    });
    expect(refresh).toHaveBeenCalledWith(true);
    expect(order).toEqual(["server", "clear", "refresh"]);
  });
});
