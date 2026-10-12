import { env } from "./env";
import { ApiError } from "./errors";

export function authOrigin() {
  const value =
    process.env.AUTH_APP_ORIGIN ||
    (env.NODE_ENV === "development" && process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : "");
  if (!value)
    throw new ApiError(
      503,
      "AUTH_CONFIGURATION_REQUIRED",
      "Authentication requires an application origin",
    );
  const url = new URL(value);
  if (url.protocol !== "https:" || url.origin !== value) {
    throw new ApiError(
      503,
      "AUTH_CONFIGURATION_REQUIRED",
      "Authentication requires an exact HTTPS application origin",
    );
  }
  return value;
}

export function providerConfig() {
  const url = process.env.SUPABASE_URL;
  const publicKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  const adminKey = process.env.SUPABASE_SECRET_KEY;
  if (
    !url ||
    !publicKey ||
    !adminKey ||
    !process.env.SESSION_SECRET ||
    process.env.SESSION_SECRET.length < 32
  ) {
    throw new ApiError(
      503,
      "AUTH_CONFIGURATION_REQUIRED",
      "Authentication provider configuration is incomplete",
    );
  }
  const parsed = new URL(url);
  if (
    parsed.protocol !== "https:" ||
    parsed.pathname !== "/" ||
    !parsed.hostname.endsWith(".supabase.co")
  ) {
    throw new ApiError(
      503,
      "AUTH_CONFIGURATION_REQUIRED",
      "Authentication provider URL is invalid",
    );
  }
  return { url, publicKey, adminKey };
}

export function smsConfigured() {
  return !!(
    process.env.MSG91_AUTH_KEY &&
    process.env.MSG91_OTP_TEMPLATE_ID &&
    process.env.SUPABASE_SMS_HOOK_SECRET
  );
}
