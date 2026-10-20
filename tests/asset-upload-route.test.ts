import { request as httpRequest } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const state = vi.hoisted(() => {
  process.env.CORS_ALLOWED_ORIGINS = "https://allowed.example";
  return { query: vi.fn(), signedIn: false, store: vi.fn() };
});
vi.mock("@workspace/db", () => ({ pool: { query: state.query } }));
// Real CSRF/session checks unless a test explicitly signs in.
vi.mock(
  "../artifacts/api-server/src/services/auth-sessions",
  async (original) => {
    const real =
      await original<
        typeof import("../artifacts/api-server/src/services/auth-sessions")
      >();
    return {
      ...real,
      requireCsrf: (req: Parameters<typeof real.requireCsrf>[0]) =>
        state.signedIn ? undefined : real.requireCsrf(req),
      readSession: (...args: Parameters<typeof real.readSession>) =>
        state.signedIn
          ? Promise.resolve({ user: { id: "uploader" } })
          : real.readSession(...args),
      requireAccount: (s: Parameters<typeof real.requireAccount>[0]) =>
        state.signedIn ? s : real.requireAccount(s),
    };
  },
);
vi.mock(
  "../artifacts/api-server/src/services/community-assets",
  async (original) => ({
    ...(await original<object>()),
    storeAssetContent: state.store,
  }),
);

import app from "../artifacts/api-server/src/app";

const id = "cc1575d2-514f-42fb-97b4-f6b6b7503a76";
const url = `/api/community/assets/${id}/content`;
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

beforeEach(() => {
  state.signedIn = false;
  state.store.mockReset();
  state.store.mockResolvedValue({ message: "Image upload completed", id });
  state.query.mockReset();
  state.query.mockImplementation(async (text: string) => ({
    rows: text.includes("rate_limit_buckets")
      ? [{ hits: 1, window_start: new Date() }]
      : [],
  }));
  vi.stubEnv("AUTH_APP_ORIGIN", "https://allowed.example");
  vi.stubEnv("SESSION_SECRET", "r".repeat(40));
});
afterEach(() => vi.unstubAllEnvs());

// Announces a body but never sends it: a response proves the API decided
// without reading (or waiting for) any body bytes.
async function headersOnly(length: number, type = "image/png") {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  try {
    return await new Promise<{ status: number; code: string }>(
      (resolve, reject) => {
        const req = httpRequest(
          {
            host: "127.0.0.1",
            port,
            path: url,
            method: "PUT",
            headers: { "Content-Type": type, "Content-Length": length },
          },
          (res) => {
            let text = "";
            res.on("data", (chunk) => (text += chunk));
            res.on("end", () => {
              resolve({
                status: res.statusCode ?? 0,
                code: JSON.parse(text).error.code,
              });
              req.destroy();
            });
          },
        );
        req.on("error", reject);
        req.flushHeaders();
      },
    );
  } finally {
    server.closeAllConnections();
    server.close();
  }
}

describe("image content upload route", () => {
  it("rejects missing CSRF before reading an oversized body", async () => {
    expect(await headersOnly(9 * 1024 * 1024)).toEqual({
      status: 403,
      code: "CSRF_REJECTED",
    });
    expect(state.store).not.toHaveBeenCalled();
  });
  it("returns 404 for a malformed asset id", async () => {
    const r = await request(app)
      .put("/api/community/assets/not-a-uuid/content")
      .set("Content-Type", "image/png")
      .send(png);
    expect(r.status).toBe(404);
    expect(state.store).not.toHaveBeenCalled();
  });
  it("passes the exact bytes and declared type to the ingest service", async () => {
    state.signedIn = true;
    const r = await request(app)
      .put(url)
      .set("Content-Type", "image/png")
      .send(png);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ message: "Image upload completed", id });
    const [, uid, assetId, type, body] = state.store.mock.calls[0];
    expect([uid, assetId, type]).toEqual(["uploader", id, "image/png"]);
    expect(Buffer.compare(body, png)).toBe(0);
  });
  it("refuses declared bodies above 8 MiB with 413 before reading them", async () => {
    state.signedIn = true;
    expect(await headersOnly(8 * 1024 * 1024 + 1, "image/webp")).toEqual({
      status: 413,
      code: "PAYLOAD_TOO_LARGE",
    });
    expect(state.store).not.toHaveBeenCalled();
  });
  it.each(["text/plain", "image/svg+xml", "application/json"])(
    "refuses %s bodies with 415",
    async (type) => {
      state.signedIn = true;
      const r = await request(app)
        .put(url)
        .set("Content-Type", type)
        .send(type === "application/json" ? "{}" : "<svg/>");
      expect(r.status).toBe(415);
      expect(state.store).not.toHaveBeenCalled();
    },
  );
  it("rejects compressed image bodies without inflating them", async () => {
    state.signedIn = true;
    const r = await request(app)
      .put(url)
      .set("Content-Type", "image/png")
      .set("Content-Encoding", "gzip")
      .send(png);
    expect(r.status).toBe(415);
    expect(r.body.error.code).toBe("ENCODING_UNSUPPORTED");
    expect(state.store).not.toHaveBeenCalled();
  });
});
