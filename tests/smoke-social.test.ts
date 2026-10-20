import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain ESM operations script without type declarations
import { smokeSocial } from "../artifacts/api-server/scripts/smoke-social.mjs";

const app = "https://app.example.test";
const supabase = "https://ref.supabase.co/auth/v1/authorize";

type Seen = { url: string; init?: RequestInit };
// Fake deployment: the app API plus Supabase's authorize hop per provider.
function deployment(
  enabled: string[],
  redirects: Record<string, { status: number; location?: string }>,
) {
  const seen: Seen[] = [];
  const fetch = async (input: URL | string, init?: RequestInit) => {
    const url = String(input);
    seen.push({ url, init });
    if (url === `${app}/api/auth/context`)
      return new Response(
        JSON.stringify({
          csrfToken: "csrf-token",
          capabilities: { socialProviders: enabled },
        }),
        {
          headers: [
            ["set-cookie", "__Host-ps-csrf=csrf-token; Path=/; Secure"],
            ["set-cookie", "__Host-ps-device=d; Path=/; Secure"],
          ],
        },
      );
    if (url === `${app}/api/auth/action`) {
      const { provider } = JSON.parse(String(init?.body));
      return Response.json({
        authorizationUrl: `${supabase}?provider=${provider}&code_challenge=x`,
      });
    }
    const provider = new URL(url).searchParams.get("provider")!;
    const hop = redirects[provider] ?? { status: 400 };
    return new Response(null, {
      status: hop.status,
      headers: hop.location ? { location: hop.location } : {},
    });
  };
  return { fetch, seen };
}

describe("social sign-in staging smoke check", () => {
  it("passes when every enabled provider redirects to its real login host", async () => {
    const { fetch, seen } = deployment(["google", "azure", "x"], {
      google: {
        status: 302,
        location: "https://accounts.google.com/o/oauth2/auth?x",
      },
      azure: {
        status: 302,
        location: "https://login.microsoftonline.com/common/oauth2",
      },
      x: { status: 302, location: "https://x.com/i/oauth2/authorize?x" },
    });
    const report = await smokeSocial(app, ["google"], fetch);
    expect(report.results.map((r: { ok: boolean }) => r.ok)).toEqual([
      true,
      true,
      true,
    ]);
    const start = seen.find((s) => s.url.endsWith("/api/auth/action"))!;
    expect(start.init?.headers).toMatchObject({
      origin: app,
      "x-csrf-token": "csrf-token",
      cookie: "__Host-ps-csrf=csrf-token; __Host-ps-device=d",
    });
    // The provider hop is inspected, never followed into a login.
    expect(
      seen
        .filter((s) => s.url.includes("supabase.co"))
        .map((s) => s.init?.redirect),
    ).toEqual(["manual", "manual", "manual"]);
  });

  it("fails a provider Supabase has not configured and an expected provider that is disabled", async () => {
    const { fetch } = deployment(["github"], {
      github: { status: 400 },
    });
    const report = await smokeSocial(app, ["facebook"], fetch);
    expect(report.results).toEqual([
      { provider: "facebook", ok: false, detail: "not enabled in Supabase" },
      {
        provider: "github",
        ok: false,
        detail: "Supabase did not redirect to the provider (status 400)",
      },
    ]);
  });

  it("fails a redirect to any host other than the provider's own", async () => {
    const { fetch } = deployment(["discord"], {
      discord: { status: 302, location: "https://discord.example.evil/oauth2" },
    });
    const [result] = (await smokeSocial(app, [], fetch)).results;
    expect(result).toMatchObject({ provider: "discord", ok: false });
  });

  it.each(["http://app.example.test", "https://app.example.test/path"])(
    "refuses a non-exact or non-HTTPS origin %s",
    async (origin) => {
      await expect(
        smokeSocial(origin, [], deployment([], {}).fetch),
      ).rejects.toThrow("exact HTTPS application origin");
    },
  );
});
