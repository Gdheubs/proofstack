import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { withoutHostingHeaders } from "../artifacts/proofstack/lib/response-headers";

const web = `${process.cwd()}/artifacts/proofstack`;
const api = `${process.cwd()}/artifacts/api-server/src`;
// Names of the services ProofStack runs on, which visitors should not see.
const PROVIDERS =
  /\b(Supabase|Firebase|MSG91|Neon|Render|Resend|Cloudflare|OpenAI|PostgreSQL|SMTP)\b/;

function files(dir: string, ext: RegExp): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory()
      ? files(full, ext)
      : ext.test(name)
        ? [full]
        : [];
  });
}
// Visible text: JSX text and string literals, without comments or imports.
function visibleText(source: string) {
  const withoutComments = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/^import .*$/gm, "");
  return [
    ...withoutComments.matchAll(/>([^<>{}]+)</g),
    ...withoutComments.matchAll(/"([^"\n]*\s[^"\n]*)"/g),
  ].map((m) => m[1]!);
}

describe("no hosting or provider names reach visitors", () => {
  it("strips upstream headers that name the hosting provider", async () => {
    const response = withoutHostingHeaders(
      new Response("ok", {
        status: 201,
        headers: {
          "rndr-id": "abc",
          "x-render-origin-server": "Render",
          "content-type": "text/plain",
        },
      }),
    );
    expect(response.status).toBe(201);
    expect(response.headers.get("rndr-id")).toBeNull();
    expect(response.headers.get("x-render-origin-server")).toBeNull();
    expect(response.headers.get("content-type")).toBe("text/plain");
    expect(await response.text()).toBe("ok");
  });

  it("keeps provider names out of page and component text", () => {
    const offenders = ["app", "components", "features"]
      .flatMap((dir) => files(`${web}/${dir}`, /\.tsx$/))
      .flatMap((file) =>
        visibleText(readFileSync(file, "utf8"))
          .filter((text) => PROVIDERS.test(text))
          .map((text) => `${path.relative(web, file)}: ${text.trim()}`),
      );
    expect(offenders).toEqual([]);
  });

  it("keeps provider names out of API error messages", () => {
    const offenders = files(api, /\.ts$/).flatMap((file) =>
      [
        ...readFileSync(file, "utf8").matchAll(
          /new ApiError\(\s*\d+,\s*"[A-Z_]+",\s*(["`])([\s\S]*?)\1/g,
        ),
      ]
        .map((m) => m[2]!)
        .filter((message) => PROVIDERS.test(message))
        .map((message) => `${path.relative(api, file)}: ${message}`),
    );
    expect(offenders).toEqual([]);
  });

  it("hides operator setup progress from the public sign-in response", () => {
    const route = readFileSync(`${api}/routes/auth.ts`, "utf8");
    expect(route).toContain("capabilities: { ...available, pendingSetup: [] }");
    expect(
      readFileSync(`${web}/features/auth/auth-view.tsx`, "utf8"),
    ).not.toContain("Pending setup");
  });
});
