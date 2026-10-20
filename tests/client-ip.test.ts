import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", () => ({ pool: { query: vi.fn() } }));

import {
  CLIENT_IP_HEADER,
  PROXY_SECRET_HEADER,
  rateLimitAddress,
  trustedProxyClient,
} from "../artifacts/api-server/src/lib/client-ip";
import { parseEnvironment } from "../artifacts/api-server/src/lib/env";
import * as web from "../artifacts/proofstack/proxy";

type WebRequest = Parameters<typeof web.proxy>[0];
const { NextRequest } = (await import(
  `${process.cwd()}/artifacts/proofstack/node_modules/next/server.js`
)) as { NextRequest: new (url: string, init?: RequestInit) => WebRequest };
const secret = "s".repeat(40);

function api(configured?: string) {
  const app = express();
  app.use(trustedProxyClient(configured));
  app.get("/", (req, res) =>
    res.json({
      subject: rateLimitAddress(req),
      ip: req.get(CLIENT_IP_HEADER) ?? null,
      secret: req.get(PROXY_SECRET_HEADER) ?? null,
    }),
  );
  return app;
}

describe("trusted client address from the web tier", () => {
  it("uses the forwarded address only with the shared secret", async () => {
    const trusted = await request(api(secret))
      .get("/")
      .set(CLIENT_IP_HEADER, "203.0.113.7")
      .set(PROXY_SECRET_HEADER, secret);
    expect(trusted.body).toEqual({
      subject: "203.0.113.7",
      ip: null,
      secret: null,
    });
    for (const supplied of [undefined, "wrong", secret + "x"]) {
      const call = request(api(secret))
        .get("/")
        .set(CLIENT_IP_HEADER, "203.0.113.7");
      if (supplied) call.set(PROXY_SECRET_HEADER, supplied);
      const res = await call;
      expect(res.body.subject).toBe("127.0.0.1");
      expect(res.body.ip).toBeNull();
      expect(res.body.secret).toBeNull();
    }
  });

  it("ignores forwarding when no secret is configured or the address is invalid", async () => {
    const unconfigured = await request(api())
      .get("/")
      .set(CLIENT_IP_HEADER, "203.0.113.7")
      .set(PROXY_SECRET_HEADER, secret);
    expect(unconfigured.body.subject).toBe("127.0.0.1");
    for (const address of ["not-an-ip", "203.0.113.7, 10.0.0.1", ""]) {
      const res = await request(api(secret))
        .get("/")
        .set(CLIENT_IP_HEADER, address)
        .set(PROXY_SECRET_HEADER, secret);
      expect(res.body.subject).toBe("127.0.0.1");
    }
  });

  it.each([
    ["2001:db8:abcd:12:1:2:3:4", "2001:db8:abcd:12::/64"],
    ["2001:db8:abcd:12::99", "2001:db8:abcd:12::/64"],
    ["2001:0db8:00ab::1", "2001:db8:ab:0::/64"],
    ["::1", "0:0:0:0::/64"],
    ["::ffff:198.51.100.2", "198.51.100.2"],
  ])("buckets IPv6 %s as %s", async (address, subject) => {
    const res = await request(api(secret))
      .get("/")
      .set(CLIENT_IP_HEADER, address)
      .set(PROXY_SECRET_HEADER, secret);
    expect(res.body.subject).toBe(subject);
  });

  it("requires a strong shared secret when one is configured", () => {
    const base = { PORT: "8080", DATABASE_URL: "postgresql://localhost/t" };
    expect(parseEnvironment(base).PROXY_SHARED_SECRET).toBeUndefined();
    expect(
      parseEnvironment({ ...base, PROXY_SHARED_SECRET: "" })
        .PROXY_SHARED_SECRET,
    ).toBeUndefined();
    expect(() =>
      parseEnvironment({ ...base, PROXY_SHARED_SECRET: "short" }),
    ).toThrow("PROXY_SHARED_SECRET");
  });
});

describe("web proxy forwarding", () => {
  afterEach(() => vi.unstubAllEnvs());
  const forwarded = (response: Response, name: string) =>
    response.headers.get(`x-middleware-request-${name}`);

  it("shares header names with the API", () => {
    expect(web.CLIENT_IP_HEADER).toBe(CLIENT_IP_HEADER);
    expect(web.PROXY_SECRET_HEADER).toBe(PROXY_SECRET_HEADER);
  });

  it("forwards the edge-provided address with the secret on API requests", () => {
    vi.stubEnv("PROXY_SHARED_SECRET", secret);
    vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", "cf-connecting-ip");
    const response = web.proxy(
      new NextRequest("https://app.test/api/auth/context", {
        headers: {
          "cf-connecting-ip": "198.51.100.9",
          "x-real-ip": "10.9.9.9",
        },
      }),
    );
    expect(forwarded(response, CLIENT_IP_HEADER)).toBe("198.51.100.9");
    expect(forwarded(response, PROXY_SECRET_HEADER)).toBe(secret);
    expect(response.headers.get("Content-Security-Policy")).toBeNull();
  });

  it("strips client-supplied trust headers and forwards nothing when unconfigured", () => {
    vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", "x-forwarded-for");
    vi.stubEnv("PROXY_SHARED_SECRET", secret);
    const response = web.proxy(
      new NextRequest("https://app.test/api/x", {
        headers: {
          "x-forwarded-for": "198.51.100.9",
          [CLIENT_IP_HEADER]: "203.0.113.1",
          [PROXY_SECRET_HEADER]: "guess",
        },
      }),
    );
    expect(forwarded(response, CLIENT_IP_HEADER)).toBeNull();
    expect(forwarded(response, PROXY_SECRET_HEADER)).toBeNull();
    const overridden = response.headers.get("x-middleware-override-headers");
    expect(overridden).not.toContain(CLIENT_IP_HEADER);
  });

  it("keeps CSP handling for pages and never adds trust headers there", () => {
    vi.stubEnv("PROXY_SHARED_SECRET", secret);
    vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", "cf-connecting-ip");
    const response = web.proxy(
      new NextRequest("https://app.test/community", {
        headers: { "cf-connecting-ip": "198.51.100.9" },
      }),
    );
    expect(response.headers.get("Content-Security-Policy")).toContain(
      "default-src",
    );
    expect(forwarded(response, PROXY_SECRET_HEADER)).toBeNull();
    expect(web.config.matcher[0]).not.toContain("api");
  });
});
