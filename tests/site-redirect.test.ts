import { afterEach, describe, expect, it, vi } from "vitest";
import * as web from "../artifacts/proofstack/proxy";

type WebRequest = Parameters<typeof web.proxy>[0];
const { NextRequest } = (await import(
  `${process.cwd()}/artifacts/proofstack/node_modules/next/server.js`
)) as { NextRequest: new (url: string, init?: RequestInit) => WebRequest };

describe("one site address after a custom domain", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("sends pages on the old address to the custom domain, keeping the path", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://proofstack.online");
    const moved = web.proxy(
      new NextRequest(
        "https://proofstack-web.example.workers.dev/suhai/app?tab=code",
      ),
    );
    expect(moved.status).toBe(301);
    expect(moved.headers.get("location")).toBe(
      "https://proofstack.online/suhai/app?tab=code",
    );
    const www = web.proxy(new NextRequest("https://www.proofstack.online/"));
    expect(www.headers.get("location")).toBe("https://proofstack.online/");
  });

  it("leaves the custom domain, API calls, Git and non-GET requests alone", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://proofstack.online");
    for (const [url, init] of [
      ["https://proofstack.online/projects", undefined],
      ["https://old.workers.dev/api/auth/context", undefined],
      ["https://old.workers.dev/suhai/app.git/info/refs", undefined],
      ["https://old.workers.dev/projects", { method: "POST" }],
    ] as const) {
      const response = web.proxy(new NextRequest(url, init));
      expect(response.status, url).not.toBe(301);
    }
  });

  it("does nothing until a custom domain is configured", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    const response = web.proxy(
      new NextRequest("https://proofstack-web.example.workers.dev/projects"),
    );
    expect(response.status).not.toBe(301);
  });
});
