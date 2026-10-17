import { readFileSync } from "node:fs";

const invalid = (field) => {
  throw new Error(`Invalid or missing development configuration: ${field}`);
};
const port = (value, field, fallback) => {
  if (value === undefined || value === "") return fallback;
  if (!/^\d+$/.test(value)) invalid(field);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 65535)
    invalid(field);
  return parsed;
};

/** Validates local-only config. Secrets are passed to children in memory, never logged. */
export function resolveDevConfiguration(
  input,
  readText = (path) => readFileSync(path, "utf8"),
) {
  if (input.NODE_ENV === "production")
    invalid("NODE_ENV (development runner refuses production)");
  const env = { ...input, NODE_ENV: "development", BIND_HOST: "127.0.0.1" };
  const webPort = port(env.WEB_PORT, "WEB_PORT", 3011);
  const apiPort = port(env.API_PORT, "API_PORT", 8089);
  if (webPort === apiPort) invalid("API_PORT/WEB_PORT");
  try {
    const database = new URL(env.DATABASE_URL);
    if (
      !["postgres:", "postgresql:"].includes(database.protocol) ||
      !["localhost", "127.0.0.1", "[::1]"].includes(database.hostname) ||
      database.pathname.length < 2
    )
      invalid("DATABASE_URL");
  } catch {
    invalid("DATABASE_URL");
  }
  try {
    const origin = new URL(env.AUTH_APP_ORIGIN);
    if (
      origin.protocol !== "https:" ||
      origin.origin !== env.AUTH_APP_ORIGIN ||
      !["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname) ||
      Number(origin.port || "443") !== webPort
    )
      invalid("AUTH_APP_ORIGIN");
  } catch {
    invalid("AUTH_APP_ORIGIN");
  }
  if (!env.SESSION_SECRET && env.SESSION_SECRET_FILE) {
    try {
      env.SESSION_SECRET = readText(env.SESSION_SECRET_FILE).replace(
        /\r?\n$/,
        "",
      );
    } catch {
      invalid("SESSION_SECRET_FILE");
    }
  }
  if (typeof env.SESSION_SECRET !== "string" || env.SESSION_SECRET.length < 32)
    invalid("SESSION_SECRET");
  const apiOrigin = `http://127.0.0.1:${apiPort}`;
  if (env.API_INTERNAL_ORIGIN && env.API_INTERNAL_ORIGIN !== apiOrigin)
    invalid("API_INTERNAL_ORIGIN");
  env.API_INTERNAL_ORIGIN = apiOrigin;
  env.CORS_ALLOWED_ORIGINS = env.AUTH_APP_ORIGIN;
  env.TRUST_PROXY_CIDRS = "";
  env.AUTH_PROVIDER ??= "supabase";
  if (!["firebase", "supabase"].includes(env.AUTH_PROVIDER))
    invalid("AUTH_PROVIDER");
  if (env.AUTH_PROVIDER === "firebase") {
    if (!env.GOOGLE_APPLICATION_CREDENTIALS)
      invalid("GOOGLE_APPLICATION_CREDENTIALS");
    let web;
    if (env.FIREBASE_WEB_CONFIG_FILE) {
      try {
        web = JSON.parse(readText(env.FIREBASE_WEB_CONFIG_FILE));
      } catch {
        invalid("FIREBASE_WEB_CONFIG_FILE");
      }
    } else {
      web = {
        projectId: env.FIREBASE_WEB_PROJECT_ID,
        authDomain: env.FIREBASE_WEB_AUTH_DOMAIN,
        apiKey: env.FIREBASE_WEB_API_KEY,
        appId: env.FIREBASE_WEB_APP_ID,
      };
    }
    if (
      !web ||
      !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(env.FIREBASE_PROJECT_ID ?? "") ||
      web.projectId !== env.FIREBASE_PROJECT_ID ||
      web.authDomain !== `${web.projectId}.firebaseapp.com` ||
      typeof web.apiKey !== "string" ||
      !web.apiKey.trim() ||
      typeof web.appId !== "string" ||
      !web.appId.trim()
    )
      invalid("FIREBASE_WEB_CONFIG");
    if (
      env.FIREBASE_WEB_AUTH_DOMAIN &&
      env.FIREBASE_WEB_AUTH_DOMAIN !== web.authDomain
    )
      invalid("FIREBASE_WEB_AUTH_DOMAIN");
    env.FIREBASE_WEB_AUTH_DOMAIN = web.authDomain;
    if (env.FIREBASE_AUTH_EMULATOR_HOST !== undefined)
      invalid("FIREBASE_AUTH_EMULATOR_HOST");
  } else {
    try {
      const identity = new URL(env.SUPABASE_URL);
      if (
        identity.protocol !== "https:" ||
        identity.origin !== env.SUPABASE_URL ||
        !identity.hostname.endsWith(".supabase.co")
      )
        invalid("SUPABASE_URL");
    } catch {
      invalid("SUPABASE_URL");
    }
    for (const key of ["SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY"])
      if (!env[key]) invalid(key);
  }
  for (const field of [
    "FIREBASE_GOOGLE_ENABLED",
    "FIREBASE_GITHUB_ENABLED",
    "INTELLIGENCE_ENABLED",
  ]) {
    if (env[field] !== undefined && !["true", "false"].includes(env[field]))
      invalid(field);
  }
  env.INTELLIGENCE_ENABLED ??= "false";
  for (const field of ["DEV_TLS_KEY_FILE", "DEV_TLS_CERT_FILE"])
    if (!env[field]) invalid(field);
  const webEnv = Object.fromEntries(
    Object.entries(env).filter(([key]) =>
      [
        "PATH",
        "Path",
        "HOME",
        "USERPROFILE",
        "APPDATA",
        "LOCALAPPDATA",
        "TEMP",
        "TMP",
        "SYSTEMROOT",
        "SystemRoot",
        "WINDIR",
        "ComSpec",
        "PATHEXT",
        "LANG",
        "LC_ALL",
        "NUMBER_OF_PROCESSORS",
        "NODE_ENV",
        "API_INTERNAL_ORIGIN",
        "FIREBASE_WEB_AUTH_DOMAIN",
      ].includes(key),
    ),
  );
  webEnv.NEXT_TELEMETRY_DISABLED = "1";
  return {
    env,
    webEnv,
    webPort,
    apiPort,
    tlsKeyFile: env.DEV_TLS_KEY_FILE,
    tlsCertFile: env.DEV_TLS_CERT_FILE,
  };
}
