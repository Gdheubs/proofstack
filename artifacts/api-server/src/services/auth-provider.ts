import {
  createClient,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";
import { providerConfig, smsConfigured } from "../lib/auth-config";
import { ApiError } from "../lib/errors";

export type Credentials = { access_token: string; refresh_token: string };
export function providerClient(
  storage?: Record<string, string>,
): SupabaseClient {
  const cfg = providerConfig();
  return createClient(cfg.url, cfg.publicKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      flowType: "pkce",
      persistSession: !!storage,
      ...(storage
        ? {
            storage: {
              getItem: (k: string) => storage[k] ?? null,
              setItem: (k: string, v: string) => {
                storage[k] = v;
              },
              removeItem: (k: string) => {
                delete storage[k];
              },
            },
          }
        : {}),
    },
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(10000) }),
    },
  });
}
export function adminClient() {
  const cfg = providerConfig();
  return createClient(cfg.url, cfg.adminKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(10000) }),
    },
  });
}
export async function sessionClient(credentials: Credentials) {
  const client = providerClient();
  const { data, error } = await client.auth.setSession(credentials);
  if (error && (!error.status || error.status >= 500)) {
    throw new ApiError(
      503,
      "AUTH_PROVIDER_UNAVAILABLE",
      "Session verification is temporarily unavailable",
    );
  }
  if (error || !data.session)
    throw new ApiError(
      401,
      "SESSION_EXPIRED",
      "Your session has expired. Sign in again",
    );
  return {
    client,
    credentials: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    },
  };
}
export function providerFailure(
  error: { status?: number; code?: string } | null,
) {
  if (!error) return;
  if (!error.status)
    throw new ApiError(
      503,
      "AUTH_PROVIDER_UNAVAILABLE",
      "The authentication provider is temporarily unavailable",
    );
  if (error.status === 429 || error.code?.includes("rate_limit")) {
    throw new ApiError(
      429,
      "AUTH_RATE_LIMITED",
      "Too many authentication attempts. Please wait before trying again",
    );
  }
  if (error.status && error.status >= 500) {
    throw new ApiError(
      503,
      "AUTH_PROVIDER_UNAVAILABLE",
      "The authentication provider is temporarily unavailable",
    );
  }
  if (
    error.code === "email_address_not_authorized" ||
    error.code === "email_address_invalid"
  ) {
    throw new ApiError(
      503,
      "EMAIL_DELIVERY_SETUP_REQUIRED",
      "Development email delivery is restricted to Supabase project-team addresses",
    );
  }
  throw new ApiError(
    400,
    "AUTH_FAILED",
    "Authentication could not be completed. Check your details or request a new verification",
  );
}
let settingsCache:
  { value: Record<string, unknown>; until: number } | undefined;
export async function capabilities() {
  if (!settingsCache || settingsCache.until < Date.now()) {
    const { url, publicKey } = providerConfig();
    const response = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: publicKey },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok)
      throw new ApiError(
        503,
        "AUTH_PROVIDER_UNAVAILABLE",
        "Authentication settings could not be verified",
      );
    settingsCache = {
      value: (await response.json()) as Record<string, unknown>,
      until: Date.now() + 30000,
    };
  }
  const external = settingsCache.value.external as Record<string, boolean>;
  const pendingSetup: string[] = [];
  const phone = !!external.phone && smsConfigured();
  if (!smsConfigured())
    pendingSetup.push("MSG91 template and Supabase SMS-hook configuration");
  if (!external.phone)
    pendingSetup.push("Enable Supabase phone authentication");
  if (!external.google) pendingSetup.push("Google OAuth provider");
  if (!external.github) pendingSetup.push("GitHub OAuth provider");
  if (process.env.AUTH_EMAIL_SMTP_READY !== "true")
    pendingSetup.push(
      "Public email delivery: verified sending domain and SMTP. Development delivery is team-only and limited",
    );
  return {
    password: !!external.email,
    emailOtp: !!external.email,
    phoneOtp: phone,
    google: !!external.google,
    github: !!external.github,
    totp: true,
    phoneMfa: phone && process.env.AUTH_PHONE_MFA_READY === "true",
    emailDelivery:
      process.env.AUTH_EMAIL_SMTP_READY === "true"
        ? ("configured" as const)
        : ("development-limited" as const),
    pendingSetup,
  };
}
// Decode only after getUser() has verified this exact access token with Supabase.
export function verifiedClaims(access: string, user: User) {
  const payload = JSON.parse(
    Buffer.from(access.split(".")[1], "base64url").toString(),
  ) as {
    sub: string;
    session_id: string;
    exp: number;
    aal: string;
  };
  if (
    payload.sub !== user.id ||
    typeof payload.session_id !== "string" ||
    typeof payload.exp !== "number" ||
    !Number.isFinite(payload.exp) ||
    payload.exp * 1000 <= Date.now() ||
    !["aal1", "aal2"].includes(payload.aal)
  )
    throw new ApiError(
      401,
      "SESSION_INVALID",
      "The provider session is invalid",
    );
  return payload;
}
