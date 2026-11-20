import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createAttemptCredential,
  createMediaTicket,
  ledgerPseudonym,
  seal,
  skillKeyRingConfigured,
  unseal,
  verifyAttemptCredential,
  verifyMediaTicket,
} from "../artifacts/api-server/src/lib/skill-crypto";

const key = (letter: string) => letter.repeat(40);
const now = Date.parse("2026-01-01T00:00:00Z");
const attempt = {
  attemptId: "11111111-1111-4111-8111-111111111111",
  sessionId: "22222222-2222-4222-8222-222222222222",
  lease: "33333333-3333-4333-8333-333333333333",
  exp: Math.floor(now / 1000) + 60,
};
const media = {
  aud: "proofstack-media-worker",
  purpose: "part" as const,
  mediaId: "44444444-4444-4444-8444-444444444444",
  owner: "a".repeat(64),
  part: 3,
  maxBytes: 5 * 1024 * 1024,
  exp: Math.floor(now / 1000) + 300,
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("skill cryptography", () => {
  it("seals with an explicit key id and opens after key rotation", () => {
    vi.stubEnv("SKILL_KEY_RING", `old:${key("o")}`);
    const saved = seal({ prompt: "private prompt" }, "question-key");
    expect(saved.key_id).toBe("old");
    expect(saved.sealed).not.toContain("private prompt");

    vi.stubEnv("SKILL_KEY_RING", `current:${key("n")},old:${key("o")}`);
    expect(unseal(saved, "question-key")).toEqual({
      prompt: "private prompt",
    });
  });

  it("rejects an unknown key id without exposing ciphertext details", () => {
    vi.stubEnv("SKILL_KEY_RING", `current:${key("n")}`);
    expect(() =>
      unseal({ key_id: "retired-missing", sealed: "not-a-secret" }, "x"),
    ).toThrow("Unable to open sealed value");
  });

  it("rejects a missing, malformed or short key ring", () => {
    vi.stubEnv("SKILL_KEY_RING", "");
    expect(skillKeyRingConfigured()).toBe(false);
    expect(() => seal("value", "purpose")).toThrow();
    vi.stubEnv("SKILL_KEY_RING", "current:short");
    expect(skillKeyRingConfigured()).toBe(false);
  });

  it("derives stable pseudonyms without returning the user id", () => {
    vi.stubEnv("LEDGER_PSEUDONYM_SECRET", key("p"));
    const first = ledgerPseudonym("user-private-id");
    expect(first).toBe(ledgerPseudonym("user-private-id"));
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(first).not.toContain("user-private-id");
  });

  it("issues an attempt credential and refuses tampering, expiry and wrong attempt", () => {
    vi.stubEnv("SKILL_KEY_RING", `current:${key("c")}`);
    const token = createAttemptCredential(attempt);
    const binding = {
      attemptId: attempt.attemptId,
      sessionId: attempt.sessionId,
      lease: attempt.lease,
    };
    expect(verifyAttemptCredential(token, binding, now)).toEqual(attempt);
    expect(
      verifyAttemptCredential(
        token,
        { ...binding, attemptId: "55555555-5555-4555-8555-555555555555" },
        now,
      ),
    ).toBeNull();
    expect(
      verifyAttemptCredential(
        token,
        { ...binding, sessionId: "55555555-5555-4555-8555-555555555555" },
        now,
      ),
    ).toBeNull();
    expect(
      verifyAttemptCredential(
        token,
        { ...binding, lease: "55555555-5555-4555-8555-555555555555" },
        now,
      ),
    ).toBeNull();
    expect(
      verifyAttemptCredential(`${token.slice(0, -1)}x`, binding, now),
    ).toBeNull();
    expect(
      verifyAttemptCredential(token, binding, (attempt.exp + 1) * 1000),
    ).toBeNull();

    vi.stubEnv("SKILL_KEY_RING", `current:${key("z")},previous:${key("c")}`);
    expect(verifyAttemptCredential(token, binding, now)).toEqual(attempt);
    expect(verifyAttemptCredential(token, undefined as never, now)).toBeNull();
  });

  it("verifies media tickets without database access and binds each ticket", () => {
    vi.stubEnv("MEDIA_TICKET_SECRET", key("m"));
    const ticket = createMediaTicket(media, now);
    const binding = {
      aud: media.aud,
      purpose: media.purpose,
      mediaId: media.mediaId,
      owner: media.owner,
      part: media.part,
    };
    expect(verifyMediaTicket(ticket, binding, now)).toMatchObject(media);
    expect(
      verifyMediaTicket(ticket, { ...binding, aud: "another-worker" }, now),
    ).toBeNull();
    expect(
      verifyMediaTicket(ticket, { ...binding, purpose: "play" }, now),
    ).toBeNull();
    expect(
      verifyMediaTicket(
        ticket,
        { ...binding, mediaId: attempt.attemptId },
        now,
      ),
    ).toBeNull();
    expect(
      verifyMediaTicket(ticket, { ...binding, owner: "b".repeat(64) }, now),
    ).toBeNull();
    expect(verifyMediaTicket(ticket, { ...binding, part: 4 }, now)).toBeNull();
    expect(
      verifyMediaTicket(ticket, { ...binding, part: undefined }, now),
    ).toBeNull();
    expect(verifyMediaTicket(ticket, undefined as never, now)).toBeNull();
    expect(
      verifyMediaTicket(`${ticket.slice(0, -1)}x`, binding, now),
    ).toBeNull();
    expect(
      verifyMediaTicket(ticket, binding, (media.exp + 1) * 1000),
    ).toBeNull();
  });

  it("matches the published deterministic media ticket vector", () => {
    const vectorsPath = fileURLToPath(
      new URL("./fixtures/ticket-vectors.json", import.meta.url),
    );
    const vector = JSON.parse(readFileSync(vectorsPath, "utf8")) as {
      secret: string;
      now: string;
      claims: typeof media;
      token: string;
    };
    vi.stubEnv("MEDIA_TICKET_SECRET", vector.secret);
    expect(createMediaTicket(vector.claims, Date.parse(vector.now))).toBe(
      vector.token,
    );
    expect(
      verifyMediaTicket(
        vector.token,
        {
          aud: vector.claims.aud,
          purpose: vector.claims.purpose,
          mediaId: vector.claims.mediaId,
          owner: vector.claims.owner,
          part: vector.claims.part,
        },
        Date.parse(vector.now),
      ),
    ).not.toBeNull();
  });

  it("does not log credentials, tickets, ciphertext or malformed input", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("SKILL_KEY_RING", `current:${key("s")}`);
    const sealed = seal({ privatePrompt: "sealed-secret-value" }, "question");
    const tampered = `${sealed.sealed.slice(0, -1)}${sealed.sealed.endsWith("A") ? "B" : "A"}`;
    let message = "";
    try {
      unseal({ ...sealed, sealed: tampered }, "question");
    } catch (caught) {
      message = caught instanceof Error ? caught.message : String(caught);
    }
    expect(message).toBe("Unable to open sealed value");
    expect(message).not.toContain("sealed-secret-value");

    vi.stubEnv("SKILL_KEY_RING", "bad-secret");
    vi.stubEnv("MEDIA_TICKET_SECRET", "bad-secret");
    expect(verifyAttemptCredential("secret-token", attempt)).toBeNull();
    expect(
      verifyMediaTicket("secret-ticket", {
        aud: "worker",
        purpose: "play",
        mediaId: media.mediaId,
        owner: media.owner,
      }),
    ).toBeNull();
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    for (const spy of [log, error, warn]) spy.mockRestore();
  });
});
