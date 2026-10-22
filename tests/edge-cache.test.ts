import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  cacheableRequest,
  edgeCopy,
  fromEdge,
} from "../artifacts/proofstack/lib/edge-cache";

const get = (path: string, cookie?: string) =>
  new Request(`https://app.test${path}`, {
    headers: cookie ? { cookie } : {},
  });
const reply = (headers: Record<string, string>, status = 200) =>
  new Response("{}", { status, headers });

describe("edge cache never stores personal data", () => {
  it("considers only signed-out GET requests to the API", () => {
    expect(cacheableRequest(get("/api/community?view=feed"))).toBe(true);
    expect(
      cacheableRequest(get("/api/community", "theme=x; __Host-ps-csrf=a")),
    ).toBe(true);
    expect(
      cacheableRequest(get("/api/community", "__Host-ps-session=abc")),
    ).toBe(false);
    expect(cacheableRequest(get("/community"))).toBe(false);
    expect(
      cacheableRequest(
        new Request("https://app.test/api/community", { method: "POST" }),
      ),
    ).toBe(false);
  });

  it("stores only public, cookie-free successful responses", () => {
    const ok = { "cache-control": "public, max-age=30, s-maxage=60" };
    expect(edgeCopy(reply({ ...ok, vary: "Cookie" }))).not.toBeNull();
    expect(
      edgeCopy(reply({ "cache-control": "private, no-store" })),
    ).toBeNull();
    expect(
      edgeCopy(reply({ "cache-control": "public, max-age=30" })),
    ).toBeNull();
    expect(edgeCopy(reply({ ...ok, "set-cookie": "a=b" }))).toBeNull();
    expect(edgeCopy(reply(ok, 404))).toBeNull();
  });

  it("serves edge copies with Vary: Cookie restored", () => {
    const stored = edgeCopy(
      reply({ "cache-control": "public, s-maxage=60", vary: "Cookie" }),
    )!;
    expect(stored.headers.get("vary")).toBeNull();
    const served = fromEdge(stored);
    expect(served.headers.get("vary")).toBe("Cookie");
    expect(served.headers.get("x-edge-cache")).toBe("HIT");
  });

  it("caches hashed build files for a year", () => {
    const rules = readFileSync(
      `${process.cwd()}/artifacts/proofstack/public/_headers`,
      "utf8",
    );
    expect(rules).toContain("/_next/static/*");
    expect(rules).toContain("public, max-age=31536000, immutable");
  });
});
