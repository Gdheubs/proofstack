import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const { query, captured } = vi.hoisted(() => ({
  query: vi.fn(),
  captured: vi.fn(),
}));
vi.mock("@workspace/db", () => ({ pool: { query } }));
vi.mock("../artifacts/api-server/src/lib/monitoring", async (original) => ({
  ...(await original<
    typeof import("../artifacts/api-server/src/lib/monitoring")
  >()),
  captureError: captured,
}));
import app from "../artifacts/api-server/src/app";
import { scrubEvent } from "../artifacts/api-server/src/lib/monitoring";
import { errorHandler } from "../artifacts/api-server/src/middlewares/error-handler";
import { ApiError } from "../artifacts/api-server/src/lib/errors";

beforeEach(() => {
  query.mockReset();
  query.mockResolvedValue({ rows: [{ hits: 1, window_start: new Date() }] });
  captured.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("monitoring keeps personal data out", () => {
  it("strips cookies, bodies, query strings, auth headers and user details", () => {
    const event = scrubEvent({
      request: {
        url: "https://app.test/api/auth/callback?code=secret",
        cookies: { "__Host-ps-session": "secret" },
        data: { password: "secret" },
        query_string: "code=secret",
        headers: {
          cookie: "secret",
          authorization: "Bearer secret",
          "user-agent": "Chrome",
        },
      },
      user: {
        id: "user-1",
        email: "person@example.test",
        ip_address: "1.2.3.4",
      },
      breadcrumbs: [{ data: { url: "/api/editor/file?path=secret" } }],
    });
    expect(JSON.stringify(event)).not.toContain("secret");
    expect(event.request!.headers).toEqual({ "user-agent": "Chrome" });
    expect(event.request!.url).toBe("https://app.test/api/auth/callback");
    expect(event.user).toEqual({ id: "user-1" });
  });
});

describe("error reporting", () => {
  const run = (error: unknown) => {
    const res = {
      headersSent: false,
      locals: { principal: { userId: "user-1" } },
      set: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    errorHandler(
      error,
      { id: "req-1", log: { error: vi.fn() } } as never,
      res as never,
      vi.fn(),
    );
    return res;
  };
  it("reports unexpected failures with the request and account IDs", () => {
    const res = run(new Error("database exploded"));
    expect(res.status).toHaveBeenCalledWith(500);
    expect(captured).toHaveBeenCalledWith(expect.any(Error), {
      requestId: "req-1",
      userId: "user-1",
      code: "INTERNAL_ERROR",
    });
  });
  it("does not report deliberate API errors, even 5xx ones", () => {
    run(new ApiError(503, "SERVICE_UPDATING", "Updating"));
    run(new ApiError(404, "NOT_FOUND", "Missing"));
    expect(captured).not.toHaveBeenCalled();
  });
});

describe("browser report relay", () => {
  const envelope = (dsn: string) =>
    `${JSON.stringify({ dsn, sent_at: "2026-10-22T00:00:00Z" })}\n{"type":"event"}\n{"message":"x"}`;
  it("does nothing when monitoring is not configured", async () => {
    const response = await request(app)
      .post("/api/monitoring/tunnel")
      .set("Content-Type", "text/plain")
      .send(envelope("https://key@o1.ingest.sentry.io/42"));
    expect(response.status).toBe(204);
  });
  it("relays only envelopes for the configured project, unchanged", async () => {
    vi.stubEnv("SENTRY_BROWSER_DSN", "https://key@o1.ingest.sentry.io/42");
    const upstream = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", upstream);
    const body = envelope("https://key@o1.ingest.sentry.io/42");
    const ok = await request(app)
      .post("/api/monitoring/tunnel")
      .set("Content-Type", "text/plain")
      .send(body);
    expect(ok.status).toBe(200);
    expect(upstream).toHaveBeenCalledTimes(1);
    const [url, init] = upstream.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://o1.ingest.sentry.io/api/42/envelope/");
    expect(Buffer.from(init.body as Buffer).toString()).toBe(body);
    for (const other of [
      "https://key@evil.example/42",
      "https://key@o1.ingest.sentry.io/43",
    ]) {
      const refused = await request(app)
        .post("/api/monitoring/tunnel")
        .set("Content-Type", "text/plain")
        .send(envelope(other));
      expect(refused.status).toBe(400);
    }
    expect(upstream).toHaveBeenCalledTimes(1);
  });
});
