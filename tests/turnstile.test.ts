import { afterEach, describe, expect, it, vi } from "vitest";
import type { Request } from "express";
import {
  assertHuman,
  turnstileEnabled,
  turnstileSiteKey,
} from "../artifacts/api-server/src/services/turnstile";

const req = {
  get: () => undefined,
  headers: {},
  ip: "203.0.113.9",
  socket: { remoteAddress: "203.0.113.9" },
} as unknown as Request;

const answer = (verdict: object, status = 200) =>
  vi.fn(async (_url: string, init?: RequestInit) => {
    void init;
    return new Response(JSON.stringify(verdict), { status });
  });

describe("Turnstile human check", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is off, and exposes no site key, without a secret", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    vi.stubEnv("TURNSTILE_SITE_KEY", "1x000");
    expect(turnstileEnabled()).toBe(false);
    expect(turnstileSiteKey()).toBe("");
    const fetcher = answer({ success: false });
    await assertHuman(req, undefined, "signup", fetcher as never);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("sends the secret, token and address, and accepts a passing verdict", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "0x-secret");
    vi.stubEnv("TURNSTILE_SITE_KEY", "1x000");
    expect(turnstileSiteKey()).toBe("1x000");
    const fetcher = answer({ success: true, action: "signup" });
    await assertHuman(req, "tok.en-1", "signup", fetcher as never);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    );
    const sent = init!.body as URLSearchParams;
    expect(sent.get("secret")).toBe("0x-secret");
    expect(sent.get("response")).toBe("tok.en-1");
    expect(sent.get("remoteip")).toBe("203.0.113.9");
  });

  it("refuses missing, malformed, failed and mismatched-action tokens", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "0x-secret");
    const failed = { status: 400, code: "HUMAN_CHECK_FAILED" };
    const pass = answer({ success: true, action: "signup" });
    await expect(
      assertHuman(req, undefined, "signup", pass as never),
    ).rejects.toMatchObject(failed);
    await expect(
      assertHuman(req, "bad token!", "signup", pass as never),
    ).rejects.toMatchObject(failed);
    expect(pass).not.toHaveBeenCalled();
    await expect(
      assertHuman(req, "tok", "signup", answer({ success: false }) as never),
    ).rejects.toMatchObject(failed);
    await expect(
      assertHuman(req, "tok", "demo-publish", pass as never),
    ).rejects.toMatchObject(failed);
  });

  it("allows the action when Cloudflare cannot be reached", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "0x-secret");
    const down = vi.fn(async () => {
      throw new Error("offline");
    });
    await expect(
      assertHuman(req, "tok", "signup", down as never),
    ).resolves.toBeUndefined();
    await expect(
      assertHuman(req, "tok", "signup", answer({}, 503) as never),
    ).resolves.toBeUndefined();
  });
});
