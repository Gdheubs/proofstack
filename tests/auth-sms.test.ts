import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const state = vi.hoisted(() => ({
  query: vi.fn(),
  receipt: undefined as string | undefined,
}));
vi.mock("@workspace/db", () => ({ pool: { query: state.query } }));
import app from "../artifacts/api-server/src/app";

const key = randomBytes(32);
const payload = JSON.stringify({
  user: { id: randomUUID(), phone: "919876543210" },
  sms: { otp: "123456" },
});
function signed(id: string, timestamp = Math.floor(Date.now() / 1000)) {
  const signature = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${payload}`)
    .digest("base64");
  return {
    "webhook-id": id,
    "webhook-timestamp": String(timestamp),
    "webhook-signature": `v1,${signature}`,
  };
}
const endpoint = "/api/auth/hooks/send-sms";
beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "unit-session-secret-longer-than-32-characters");
  vi.stubEnv("MSG91_AUTH_KEY", "unit-msg91-key");
  vi.stubEnv("MSG91_OTP_TEMPLATE_ID", "unit-otp-template");
  vi.stubEnv("SUPABASE_SMS_HOOK_SECRET", `v1,whsec_${key.toString("base64")}`);
  state.receipt = undefined;
  state.query.mockReset();
  state.query.mockImplementation(async (sql: string) => {
    if (sql.includes("rate_limit_buckets"))
      return { rows: [{ hits: 1, window_start: new Date() }], rowCount: 1 };
    if (sql.startsWith("SELECT status"))
      return { rows: state.receipt ? [{ status: state.receipt }] : [] };
    if (sql.includes("INSERT INTO auth_hook_receipts")) {
      state.receipt = "pending";
      return { rows: [{ event_hash: "hashed-event" }], rowCount: 1 };
    }
    if (sql.includes("UPDATE auth_hook_receipts")) {
      state.receipt = "accepted";
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes("INSERT INTO audit_logs"))
      return { rows: [{ id: randomUUID() }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify({ type: "success" }), { status: 200 }),
    ),
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("signed provider SMS transport", () => {
  it("rejects missing/forged signatures before delivery", async () => {
    const response = await request(app)
      .post(endpoint)
      .set("Content-Type", "application/json")
      .send(payload);
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("HOOK_SIGNATURE_INVALID");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects an expired signed request", async () => {
    const response = await request(app)
      .post(endpoint)
      .set("Content-Type", "application/json")
      .set(signed("old-event", Math.floor(Date.now() / 1000) - 3600))
      .send(payload);
    expect(response.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("transports the exact provider code, without establishing an app session", async () => {
    const response = await request(app)
      .post(endpoint)
      .set("Content-Type", "application/json")
      .set(signed("valid-event"))
      .send(payload);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({});
    expect(response.headers["set-cookie"]).toBeUndefined();
    const call = vi.mocked(fetch).mock.calls[0];
    expect(new URL(String(call[0])).searchParams.get("otp")).toBe("123456");
    expect(JSON.parse(String(call[1]?.body))).toEqual({ otp: "123456" });
    expect(new Headers(call[1]?.headers).get("authkey")).toBe("unit-msg91-key");
  });
  it("does not redeliver an accepted event, even after session-key rotation", async () => {
    const headers = signed("same-event");
    expect(
      (
        await request(app)
          .post(endpoint)
          .set("Content-Type", "application/json")
          .set(headers)
          .send(payload)
      ).status,
    ).toBe(200);
    vi.stubEnv(
      "SESSION_SECRET",
      "different-unit-session-secret-longer-than-32",
    );
    expect(
      (
        await request(app)
          .post(endpoint)
          .set("Content-Type", "application/json")
          .set(headers)
          .send(payload)
      ).status,
    ).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("fails closed for uncertain delivery and does not retry blindly", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(
      new Error("private-provider-details"),
    );
    const headers = signed("uncertain-event");
    const failed = await request(app)
      .post(endpoint)
      .set("Content-Type", "application/json")
      .set(headers)
      .send(payload);
    expect(failed.status).toBe(500);
    expect(JSON.stringify(failed.body)).not.toContain(
      "private-provider-details",
    );
    const retry = await request(app)
      .post(endpoint)
      .set("Content-Type", "application/json")
      .set(headers)
      .send(payload);
    expect(retry.status).toBe(503);
    expect(retry.body.error.code).toBe("SMS_DELIVERY_PENDING");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
