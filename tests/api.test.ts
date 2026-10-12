import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { gzipSync } from "node:zlib";

const { queryMock } = vi.hoisted(() => {
  process.env.CORS_ALLOWED_ORIGINS = "https://allowed.example";
  return { queryMock: vi.fn() };
});
vi.mock("@workspace/db", () => ({ pool: { query: queryMock } }));

import app from "../artifacts/api-server/src/app";

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockImplementation(async (text: string) => ({
    rows: text.includes("rate_limit_buckets")
      ? [{ hits: 1, window_start: new Date() }]
      : [{ healthy: 1 }],
  }));
});

describe("ProofStack API boundary", () => {
  it("charges malformed bodies to the limiter before parsing them", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ hits: 121, window_start: new Date() }],
    });
    const r = await request(app)
      .post("/api/community/action")
      .set("Content-Type", "application/json")
      .send('{"broken":');
    expect(r.status).toBe(429);
    expect(r.headers["cache-control"]).toBe("private, no-store");
  });
  it("rejects compressed bodies without inflating attacker-controlled data", async () => {
    const r = await request(app)
      .post("/api/community/action")
      .set("Content-Type", "application/json")
      .set("Content-Encoding", "gzip")
      .send(
        gzipSync(Buffer.from(JSON.stringify({ body: "x".repeat(100000) }))),
      );
    expect(r.status).toBe(415);
    expect(r.body.error.code).toBe("ENCODING_UNSUPPORTED");
  });
  it("does not let spoofed forwarding headers rotate the default IP bucket", async () => {
    await request(app)
      .get("/api/not-a-route")
      .set("X-Forwarded-For", "1.2.3.4");
    const key = queryMock.mock.calls[0][1][0];
    queryMock.mockClear();
    await request(app)
      .get("/api/not-a-route")
      .set("X-Forwarded-For", "5.6.7.8");
    expect(queryMock.mock.calls[0][1][0]).toBe(key);
  });
  it("rejects forged identities on private views and cross-site product writes", async () => {
    for (const path of [
      "/api/intelligence",
      "/api/operations",
      "/api/auth/account",
    ]) {
      const r = await request(app)
        .get(path)
        .set("X-User-ID", "11111111-1111-4111-8111-111111111111")
        .set("X-Role", "super_admin");
      expect(r.status).toBe(401);
      expect(r.headers["cache-control"]).toBe("private, no-store");
    }
    vi.stubEnv("AUTH_APP_ORIGIN", "https://allowed.example");
    try {
      for (const path of [
        "/api/community/action",
        "/api/careers/action",
        "/api/repositories/action",
        "/api/pulls/action",
        "/api/intelligence/action",
      ]) {
        const r = await request(app)
          .post(path)
          .set("Origin", "https://evil.example")
          .send({ action: "delete", role: "super_admin" });
        expect(r.status).toBe(403);
      }
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it("pauses product writes in maintenance mode while retaining liveness", async () => {
    vi.stubEnv("MAINTENANCE_MODE", "true");
    try {
      const r = await request(app)
        .post("/api/pulls/action")
        .send({ action: "merge" });
      expect(r.status).toBe(503);
      expect(r.body.error.code).toBe("MAINTENANCE_MODE");
      expect((await request(app).get("/api/healthz")).status).toBe(200);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("protects career actions with CSRF and private career views with authentication", async () => {
    for (const view of ["dashboard", "applications", "application"]) {
      const response = await request(app).get("/api/careers").query({ view });
      expect(response.status).toBe(401);
      expect(response.headers["cache-control"]).toBe("private, no-store");
    }
    vi.stubEnv("AUTH_APP_ORIGIN", "https://allowed.example");
    try {
      const response = await request(app)
        .post("/api/careers/action")
        .send({ action: "career-save" });
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("CSRF_REJECTED");
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it("returns liveness without requiring the database and sets security headers", async () => {
    const response = await request(app)
      .get("/api/healthz")
      .set("X-Request-ID", "untrusted");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
    expect(queryMock).not.toHaveBeenCalled();
    expect(response.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-powered-by"]).toBeUndefined();
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("reports actual database readiness, including failure", async () => {
    expect((await request(app).get("/api/readyz")).body).toEqual({
      status: "ready",
      checks: { database: "ready" },
    });
    queryMock.mockRejectedValueOnce(new Error("private-database-details"));
    const failed = await request(app).get("/api/readyz");
    expect(failed.status).toBe(503);
    expect(failed.body).toEqual({
      status: "not_ready",
      checks: { database: "unavailable" },
    });
    expect(JSON.stringify(failed.body)).not.toContain(
      "private-database-details",
    );
  });

  it("allows only explicitly configured cross-origin requests", async () => {
    const allowed = await request(app)
      .get("/api/healthz")
      .set("Origin", "https://allowed.example");
    expect(allowed.status).toBe(200);
    expect(allowed.headers["access-control-allow-origin"]).toBe(
      "https://allowed.example",
    );
    const denied = await request(app)
      .get("/api/healthz")
      .set("Origin", "https://evil.example");
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe("ORIGIN_DENIED");
    expect(denied.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("returns consistent correlated errors without leaking input", async () => {
    const missing = await request(app).get("/api/not-a-route");
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe("NOT_FOUND");
    expect(missing.body.requestId).toBe(missing.headers["x-request-id"]);
    const malformed = await request(app)
      .post("/api/not-a-route")
      .set("Content-Type", "application/json")
      .send('{"password":"do-not-leak"');
    expect(malformed.status).toBe(400);
    expect(malformed.body.error.code).toBe("INVALID_JSON");
    expect(JSON.stringify(malformed.body)).not.toContain("do-not-leak");
    const large = await request(app)
      .post("/api/not-a-route")
      .send({ value: "a".repeat(40000) });
    expect(large.status).toBe(413);
  });

  it("enforces the rate limit and fails closed if the store is unavailable", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ hits: 121, window_start: new Date() }],
    });
    const limited = await request(app).get("/api/not-a-route");
    expect(limited.status).toBe(429);
    expect(limited.headers["retry-after"]).toBeDefined();
    expect(limited.headers["ratelimit-remaining"]).toBe("0");
    queryMock.mockRejectedValueOnce(new Error("private-connection-details"));
    const unavailable = await request(app).get("/api/not-a-route");
    expect(unavailable.status).toBe(503);
    expect(unavailable.body.error.code).toBe("RATE_LIMIT_UNAVAILABLE");
    expect(JSON.stringify(unavailable.body)).not.toContain(
      "private-connection-details",
    );
  });
});
