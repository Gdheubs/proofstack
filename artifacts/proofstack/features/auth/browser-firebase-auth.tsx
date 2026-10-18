"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { errInfo, useAct, useSession } from "../../hooks/use-auth";
import { createAuthReturn, type AuthReturn } from "../../lib/auth-return";

import type {
  Auth,
  MultiFactorError,
  MultiFactorResolver,
  UserCredential,
} from "firebase/auth";

type FirebaseBrowserSdk = Pick<typeof import("firebase/app"), "initializeApp"> &
  Pick<
    typeof import("firebase/auth"),
    | "initializeAuth"
    | "inMemoryPersistence"
    | "browserPopupRedirectResolver"
    | "signInWithPopup"
    | "signOut"
    | "GoogleAuthProvider"
    | "GithubAuthProvider"
    | "getMultiFactorResolver"
    | "TotpMultiFactorGenerator"
  >;
export type FirebaseBrowserClient = { auth: Auth; sdk: FirebaseBrowserSdk };

export async function createFirebaseBrowserClient(
  config: FirebaseBrowserConfig,
  dependencies?: FirebaseBrowserSdk,
): Promise<FirebaseBrowserClient> {
  const sdk = dependencies ?? {
    ...(await import("firebase/app")),
    ...(await import("firebase/auth")),
  };
  const app = sdk.initializeApp(config.firebase, "proofstack-browser");
  const auth = sdk.initializeAuth(app, {
    persistence: sdk.inMemoryPersistence,
    popupRedirectResolver: sdk.browserPopupRedirectResolver,
  });
  return { auth, sdk };
}

export async function startFirebasePopup(
  { auth, sdk }: FirebaseBrowserClient,
  provider: "google" | "github",
): Promise<
  | { kind: "user"; user: UserCredential["user"] }
  | { kind: "challenge"; resolver: MultiFactorResolver }
> {
  try {
    const result = await sdk.signInWithPopup(
      auth,
      provider === "google"
        ? new sdk.GoogleAuthProvider()
        : new sdk.GithubAuthProvider(),
    );
    return { kind: "user", user: result.user };
  } catch (error) {
    if (
      (error as { code?: string })?.code === "auth/multi-factor-auth-required"
    ) {
      return {
        kind: "challenge",
        resolver: sdk.getMultiFactorResolver(auth, error as MultiFactorError),
      };
    }
    await sdk.signOut(auth).catch(() => {});
    throw error;
  }
}

export async function resolveFirebaseTotp(
  { sdk }: FirebaseBrowserClient,
  resolver: MultiFactorResolver,
  uid: string,
  code: string,
): Promise<UserCredential["user"]> {
  if (
    !resolver.hints.some(
      (hint) =>
        hint.uid === uid &&
        hint.factorId === sdk.TotpMultiFactorGenerator.FACTOR_ID,
    )
  ) {
    throw new Error(
      "Choose an enrolled authenticator factor. SMS challenges are not supported here.",
    );
  }
  if (!/^\d{6}$/.test(code))
    throw new Error("Enter the 6-digit code from your authenticator.");
  const assertion = sdk.TotpMultiFactorGenerator.assertionForSignIn(uid, code);
  return (await resolver.resolveSignIn(assertion)).user;
}

export async function handoffFirebaseSession({
  user,
  csrfToken,
  clear,
  refresh,
  request = fetch,
}: {
  user: { getIdToken: (forceRefresh?: boolean) => Promise<string> };
  csrfToken: string;
  clear: () => Promise<void>;
  refresh: (identity: boolean) => Promise<void>;
  request?: typeof fetch;
}): Promise<void> {
  let failure: unknown;
  let failed = false;
  let confirmed = false;
  try {
    if (!csrfToken)
      throw new Error("Security token is unavailable. Reload and retry.");
    const idToken = await user.getIdToken(true);
    const response = await request("/api/auth/firebase/session", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfToken,
      },
      body: JSON.stringify({ idToken }),
    });
    const payload = (await response.json().catch(() => null)) as {
      signedIn?: boolean;
      error?: { message?: string };
    } | null;
    if (!response.ok)
      throw new Error(
        payload?.error?.message ||
          `Session request failed (${response.status}).`,
      );
    if (payload?.signedIn !== true)
      throw new Error("The server did not confirm sign-in. Retry to continue.");
    confirmed = true;
  } catch (error) {
    failed = true;
    failure = error;
  }
  try {
    await clear();
  } catch (error) {
    if (!failed) {
      failed = true;
      failure = error;
    }
  }
  if (confirmed) await refresh(true);
  if (failed) throw failure;
}

export type FirebaseBrowserConfig = {
  provider: "firebase";
  firebase: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    appId: string;
  };
  providers: { google: boolean; github: boolean };
};
export type BrowserAuthConfig =
  { provider: "supabase" } | FirebaseBrowserConfig;

export function firebaseSignInProblem(error: unknown): {
  message: string;
  openInNewTab: boolean;
} {
  const code = (error as { code?: string })?.code;
  const messages: Record<string, string> = {
    "auth/account-exists-with-different-credential":
      "Sign in with the provider you originally used. Accounts are not linked automatically.",
    "auth/popup-blocked":
      "Your browser blocked the sign-in popup. Allow popups, or open this app in its own tab and try again.",
    "auth/popup-closed-by-user":
      "Sign-in was cancelled. Choose a provider to try again.",
    "auth/invalid-verification-code":
      "That authenticator code is invalid or expired. Enter a fresh code.",
    "auth/invalid-multi-factor-session":
      "The second-factor challenge expired. Start sign-in again.",
    "auth/network-request-failed":
      "Could not reach the sign-in provider. Check your connection and try again.",
    "auth/unauthorized-domain":
      "Sign-in is not configured for this app domain. Contact the administrator.",
  };
  return {
    message: code
      ? (messages[code] ??
        "Sign-in could not be completed. Try again or contact the administrator.")
      : error instanceof Error
        ? error.message
        : "Sign-in could not be completed. Try again or contact the administrator.",
    openInNewTab: code === "auth/popup-blocked",
  };
}

export async function fetchBrowserAuthConfig(
  signal?: AbortSignal,
  request: typeof fetch = fetch,
): Promise<BrowserAuthConfig> {
  const response = await request("/api/auth/firebase/config", {
    credentials: "same-origin",
    cache: "no-store",
    signal,
  });
  if (!response.ok)
    throw new Error(
      `Authentication configuration request failed (${response.status}). Retry to continue.`,
    );
  return parseBrowserAuthConfig(await response.json());
}

export function parseBrowserAuthConfig(value: unknown): BrowserAuthConfig {
  const data = value as Partial<FirebaseBrowserConfig> | null;
  if (data?.provider === ("supabase" as string))
    return { provider: "supabase" };
  if (
    data?.provider !== "firebase" ||
    !data.firebase ||
    ![
      data.firebase.apiKey,
      data.firebase.authDomain,
      data.firebase.projectId,
      data.firebase.appId,
    ].every((item) => typeof item === "string" && item.trim().length > 0) ||
    typeof data.providers?.google !== "boolean" ||
    typeof data.providers?.github !== "boolean"
  )
    throw new Error(
      "Authentication configuration is unavailable or invalid. Retry to continue.",
    );
  return {
    provider: "firebase",
    firebase: {
      apiKey: data.firebase.apiKey,
      authDomain: data.firebase.authDomain,
      projectId: data.firebase.projectId,
      appId: data.firebase.appId,
    },
    providers: { google: data.providers.google, github: data.providers.github },
  };
}

const buttonClass =
  "inline-flex min-h-10 items-center justify-center rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";

export function BrowserAuthSelection({
  query,
  legacy,
  returnTo,
}: {
  query: {
    isPending: boolean;
    isError: boolean;
    error: unknown;
    data?: BrowserAuthConfig;
    refetch: () => unknown;
  };
  legacy: React.ReactNode;
  returnTo?: AuthReturn;
}) {
  if (query.isPending) return <p role="status">Loading sign-in options...</p>;
  if (query.isError || !query.data)
    return (
      <div className="space-y-3">
        <p role="alert">
          {query.isError
            ? errInfo(query.error).message
            : "Authentication configuration is unavailable. Retry to continue."}
        </p>
        <button
          type="button"
          className={buttonClass}
          onClick={() => query.refetch()}
        >
          Retry sign-in options
        </button>
      </div>
    );
  return query.data.provider === "supabase" ? (
    legacy
  ) : (
    <BrowserFirebaseAuth config={query.data} returnTo={returnTo} />
  );
}

export function BrowserFirebaseAuth({
  config,
  returnTo,
}: {
  config: FirebaseBrowserConfig;
  returnTo?: AuthReturn;
}) {
  const q = useSession();
  const { act, refresh } = useAct();
  const router = useRouter();
  const [defaultReturn] = useState(() => createAuthReturn(""));
  const destination = returnTo ?? defaultReturn;
  const [client, setClient] = useState<FirebaseBrowserClient | null>(null);
  const [resolver, setResolver] = useState<MultiFactorResolver | null>(null);
  const [factor, setFactor] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ReturnType<
    typeof firebaseSignInProblem
  > | null>(null);
  const [framed, setFramed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const locked = useRef(false);
  const alive = useRef(false);
  const ctx = q.data;
  const ready =
    !q.isLoading && !q.isError && !!ctx?.authenticated && !ctx.mfaRequired;

  useEffect(() => {
    if (ready) destination.complete(ctx, (path) => router.replace(path));
  }, [ready, ctx, router, destination]);

  useEffect(() => {
    alive.current = true;
    let disposed = false;
    let initialized: FirebaseBrowserClient | null = null;
    try {
      setFramed(window.self !== window.top);
    } catch {
      setFramed(true);
    }
    setClient(null);
    createFirebaseBrowserClient(config)
      .then(async (next) => {
        initialized = next;
        if (disposed) await next.sdk.signOut(next.auth);
        else setClient(next);
      })
      .catch((error: unknown) => {
        if (!disposed) setProblem(firebaseSignInProblem(error));
      });
    return () => {
      disposed = true;
      alive.current = false;
      // Unmount never retains the browser user, even while a challenge is open.
      if (initialized)
        void initialized.sdk.signOut(initialized.auth).catch(() => {});
    };
  }, [config, attempt]);

  const complete = async (
    user: UserCredential["user"],
    current: FirebaseBrowserClient,
  ) => {
    if (!alive.current) {
      await current.sdk.signOut(current.auth);
      return;
    }
    await handoffFirebaseSession({
      user,
      csrfToken: ctx?.csrfToken ?? "",
      refresh,
      clear: () => current.sdk.signOut(current.auth),
    });
    // Navigation is owned by the refreshed app-session effect above. A native
    // handoff alone must not bypass an outstanding app MFA requirement.
  };
  const start = async (provider: "google" | "github") => {
    if (
      !client ||
      locked.current ||
      framed ||
      !config.providers[provider] ||
      !ctx?.csrfToken
    )
      return;
    locked.current = true;
    setBusy(true);
    setProblem(null);
    try {
      // The SDK is warmed up before enabling the button, keeping this call in
      // the user's click gesture rather than waiting for a lazy import first.
      const result = await startFirebasePopup(client, provider);
      if (!alive.current) {
        await client.sdk.signOut(client.auth);
        return;
      }
      if (result.kind === "challenge") {
        setResolver(result.resolver);
        setFactor(
          result.resolver.hints.find(
            (hint) =>
              hint.factorId === client.sdk.TotpMultiFactorGenerator.FACTOR_ID,
          )?.uid ?? "",
        );
        setCode("");
      } else await complete(result.user, client);
    } catch (error) {
      if (alive.current) setProblem(firebaseSignInProblem(error));
    } finally {
      locked.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const verify = async () => {
    if (!client || !resolver || locked.current) return;
    locked.current = true;
    setBusy(true);
    setProblem(null);
    try {
      const user = await resolveFirebaseTotp(client, resolver, factor, code);
      setResolver(null);
      await complete(user, client);
    } catch (error) {
      if (alive.current) setProblem(firebaseSignInProblem(error));
    } finally {
      locked.current = false;
      if (alive.current) {
        setCode("");
        setBusy(false);
      }
    }
  };
  const cancel = async () => {
    if (!client || locked.current) return;
    setResolver(null);
    setCode("");
    setProblem(null);
    try {
      await client.sdk.signOut(client.auth);
    } catch (error) {
      setProblem(firebaseSignInProblem(error));
    }
  };
  const logout = async () => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setProblem(null);
    try {
      if (client) await client.sdk.signOut(client.auth);
      await act({ action: "logout", scope: "local" });
      setResolver(null);
      setCode("");
    } catch (error) {
      setProblem({ message: errInfo(error).message, openInNewTab: false });
    } finally {
      locked.current = false;
      if (alive.current) setBusy(false);
    }
  };

  if (q.isLoading) return <p role="status">Loading your sign-in session...</p>;
  if (q.isError || !ctx)
    return (
      <div className="space-y-3">
        <p role="alert">{errInfo(q.error).message}</p>
        <button
          type="button"
          className={buttonClass}
          onClick={() => q.refetch()}
        >
          Retry session
        </button>
      </div>
    );
  if (ready)
    return (
      <div>
        <p role="status">Signed in. Taking you to your destination...</p>
        <a href={destination.destination} className="mt-3 block underline">
          Continue
        </a>
      </div>
    );
  const hints =
    resolver?.hints.filter(
      (hint) =>
        hint.factorId === client?.sdk.TotpMultiFactorGenerator.FACTOR_ID,
    ) ?? [];
  return (
    <div className="space-y-4" aria-busy={busy}>
      <h2 className="text-2xl font-semibold">
        {resolver ? "Verify your authenticator" : "Sign in to ProofStack"}
      </h2>
      <p className="text-sm text-muted-foreground">
        Use Google or GitHub. Your app session stays in a secure server cookie,
        not browser storage.
      </p>
      {ctx.authenticated && ctx.mfaRequired && (
        <div
          role="status"
          className="rounded-md border border-accent/60 bg-accent/10 p-3 text-sm"
        >
          Privileged access remains blocked until a native Firebase
          second-factor sign-in succeeds. If you already enrolled an
          authenticator, sign in again below to verify it. Native MFA enrollment
          is pending in this app; contact your administrator if you have not
          enrolled.
        </div>
      )}
      {(framed || problem?.openInNewTab) && (
        <div role="status" className="rounded-md border p-3 text-sm">
          Open the app in its own tab before continuing, and allow sign-in
          popups.
          <a
            href={`/auth?next=${encodeURIComponent(destination.destination)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 block underline"
          >
            Open /auth in a new tab
          </a>
        </div>
      )}
      {resolver ? (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void verify();
          }}
        >
          {hints.length ? (
            <>
              <label className="block space-y-1 text-sm">
                Authenticator
                <select
                  className="block min-h-10 w-full rounded-md border bg-background px-3"
                  value={factor}
                  disabled={busy}
                  onChange={(event) => setFactor(event.target.value)}
                >
                  {hints.map((hint, index) => (
                    <option key={hint.uid} value={hint.uid}>
                      {hint.displayName || `Authenticator ${index + 1}`}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1 text-sm">
                6-digit authenticator code
                <input
                  className="block min-h-10 w-full rounded-md border bg-background px-3 font-mono tracking-widest"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  pattern="[0-9]{6}"
                  required
                  disabled={busy}
                />
              </label>
              <button className={buttonClass} type="submit" disabled={busy}>
                {busy ? "Verifying..." : "Verify and sign in"}
              </button>
            </>
          ) : (
            <p role="alert">
              This account has no supported TOTP challenge. SMS second factors
              are not supported here. Contact your administrator; access remains
              blocked.
            </p>
          )}
          <button
            className={`${buttonClass} ml-2`}
            type="button"
            disabled={busy}
            onClick={() => void cancel()}
          >
            Start over
          </button>
        </form>
      ) : (
        <div className="space-y-3">
          {(["google", "github"] as const).map((provider) => (
            <button
              key={provider}
              type="button"
              className={`${buttonClass} w-full justify-start`}
              disabled={
                !config.providers[provider] ||
                !client ||
                busy ||
                framed ||
                !ctx.csrfToken
              }
              onClick={() => void start(provider)}
              data-testid={`button-oauth-${provider}`}
            >
              Continue with {provider === "google" ? "Google" : "GitHub"}
              {!config.providers[provider] && (
                <span className="ml-auto text-xs">pending setup</span>
              )}
            </button>
          ))}
        </div>
      )}
      {problem && (
        <div className="space-y-2">
          <p role="alert" className="text-sm text-destructive">
            {problem.message}
          </p>
          {!client && (
            <button
              type="button"
              className={buttonClass}
              onClick={() => {
                setProblem(null);
                setAttempt((value) => value + 1);
              }}
            >
              Retry sign-in setup
            </button>
          )}
        </div>
      )}
      {!client && !problem && (
        <p role="status" className="text-xs text-muted-foreground">
          Preparing secure sign-in...
        </p>
      )}
      {ctx.authenticated && (
        <button
          type="button"
          className={buttonClass}
          disabled={busy}
          onClick={() => void logout()}
        >
          Sign out
        </button>
      )}
    </div>
  );
}
