import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertPasswordNotBreached } from "../artifacts/api-server/src/services/password-breach";

const sha1 = (s: string) =>
  createHash("sha1").update(s).digest("hex").toUpperCase();

describe("leaked-password check", () => {
  afterEach(() => vi.unstubAllEnvs());
  const range = (lines: string[]) =>
    vi.fn(async (_url: string) => new Response(lines.join("\r\n")));

  it("sends only the first five hash characters and refuses a known password", async () => {
    vi.stubEnv("PASSWORD_BREACH_CHECK", "");
    const hash = sha1("password123");
    const fetcher = range([
      `${hash.slice(5)}:12345`,
      "0000000000000000000000000000000000A:0",
    ]);
    await expect(
      assertPasswordNotBreached("password123", fetcher as never),
    ).rejects.toMatchObject({ status: 400, code: "PASSWORD_BREACHED" });
    const url = String(fetcher.mock.calls[0][0]);
    expect(url).toBe(
      `https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`,
    );
    expect(url).not.toContain(hash.slice(5));
  });

  it("accepts an unknown password, padded zero-count rows, and outages", async () => {
    vi.stubEnv("PASSWORD_BREACH_CHECK", "");
    const hash = sha1("correct horse battery staple 9");
    await expect(
      assertPasswordNotBreached(
        "correct horse battery staple 9",
        range([`${hash.slice(5)}:0`, "ABCDEF:3"]) as never,
      ),
    ).resolves.toBeUndefined();
    const down = vi.fn(async () => {
      throw new Error("offline");
    });
    await expect(
      assertPasswordNotBreached("password123", down as never),
    ).resolves.toBeUndefined();
    const failing = vi.fn(async () => new Response("", { status: 503 }));
    await expect(
      assertPasswordNotBreached("password123", failing as never),
    ).resolves.toBeUndefined();
  });

  it("can be switched off", async () => {
    vi.stubEnv("PASSWORD_BREACH_CHECK", "off");
    const fetcher = vi.fn();
    await assertPasswordNotBreached("password123", fetcher as never);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
