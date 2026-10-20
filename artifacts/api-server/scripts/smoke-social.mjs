// Staging smoke check for social sign-in, up to each provider's login page.
// It starts one OAuth flow per enabled provider through the deployed app and
// confirms Supabase redirects to that provider's real authorization host. It
// never signs in, needs no credentials, and prints no tokens or cookies.
// Usage: node scripts/smoke-social.mjs https://app.example.com [--expect google,github]

import { pathToFileURL } from "node:url";

export const PROVIDER_HOSTS = {
  google: ["accounts.google.com"],
  github: ["github.com"],
  azure: ["login.microsoftonline.com"],
  linkedin_oidc: ["www.linkedin.com"],
  gitlab: ["gitlab.com"],
  discord: ["discord.com"],
  x: ["x.com", "twitter.com"],
  facebook: ["www.facebook.com"],
};

const timeout = () => AbortSignal.timeout(15000);

export async function smokeSocial(origin, expected = [], fetchImpl = fetch) {
  const app = new URL(origin);
  if (app.protocol !== "https:" || app.origin !== origin)
    throw new Error("Use the exact HTTPS application origin.");
  const context = await fetchImpl(new URL("/api/auth/context", app), {
    signal: timeout(),
    redirect: "error",
  });
  if (!context.ok) throw new Error(`Auth context failed: ${context.status}`);
  const body = await context.json();
  const cookie = context.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  const enabled = body.capabilities?.socialProviders ?? [];
  const results = [];
  for (const provider of expected.filter((p) => !enabled.includes(p)))
    results.push({ provider, ok: false, detail: "not enabled in Supabase" });
  for (const provider of enabled) {
    const result = { provider, ok: false, detail: "" };
    results.push(result);
    try {
      const start = await fetchImpl(new URL("/api/auth/action", app), {
        method: "POST",
        signal: timeout(),
        redirect: "error",
        headers: {
          "content-type": "application/json",
          origin: app.origin,
          "x-csrf-token": body.csrfToken,
          cookie,
        },
        body: JSON.stringify({ action: "oauth", provider }),
      });
      const started = await start.json();
      if (!start.ok || !started.authorizationUrl) {
        result.detail = `start failed: ${start.status} ${started.error?.code ?? ""}`;
        continue;
      }
      const authorize = new URL(started.authorizationUrl);
      if (
        authorize.protocol !== "https:" ||
        !authorize.hostname.endsWith(".supabase.co") ||
        authorize.searchParams.get("provider") !== provider
      ) {
        result.detail = "unexpected Supabase authorize address";
        continue;
      }
      const hop = await fetchImpl(authorize, {
        signal: timeout(),
        redirect: "manual",
      });
      const location = hop.headers.get("location");
      const host = location ? new URL(location).hostname : "";
      if (
        hop.status >= 300 &&
        hop.status < 400 &&
        PROVIDER_HOSTS[provider]?.includes(host)
      ) {
        result.ok = true;
        result.detail = `redirects to ${host}`;
      } else {
        result.detail = `Supabase did not redirect to the provider (status ${hop.status}${host ? `, host ${host}` : ""})`;
      }
    } catch (error) {
      result.detail = `request failed: ${error?.name ?? "Error"}`;
    }
  }
  return { enabled, results };
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  const origin = process.argv[2];
  const flag = process.argv.indexOf("--expect");
  const expected =
    flag > 0 ? (process.argv[flag + 1] ?? "").split(",").filter(Boolean) : [];
  if (!origin) {
    console.error(
      "Usage: node scripts/smoke-social.mjs https://app.example.com [--expect google,github]",
    );
    process.exit(2);
  }
  const report = await smokeSocial(origin, expected);
  console.log(JSON.stringify(report, null, 2));
  process.exitCode =
    report.results.length && report.results.every((r) => r.ok) ? 0 : 1;
}
