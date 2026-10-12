import { describe, it, expect } from "vitest";
import {
  parseCommunityAction,
  mentionHandles,
  linkSchema,
} from "../artifacts/api-server/src/services/community-input";
const id = "cc1575d2-514f-42fb-97b4-f6b6b7503a75";
describe("Community input and evidence boundary", () => {
  it("allows the requested suhail handle without seeding it", () =>
    expect(
      parseCommunityAction({
        action: "profile-save",
        handle: "Suhail",
        displayName: "Suhail",
      }),
    ).toMatchObject({ handle: "suhail", skills: [] }));
  it.each(["me", "settings", "admin", "ab", "UPPER SPACE"])(
    "rejects reserved or malformed handle %s",
    (handle) =>
      expect(() =>
        parseCommunityAction({
          action: "profile-save",
          handle,
          displayName: "Name",
        }),
      ).toThrow(),
  );
  it("does not accept a claimed verification or administrative role on a profile", () =>
    expect(() =>
      parseCommunityAction({
        action: "profile-save",
        handle: "builder",
        displayName: "Name",
        verified: true,
        role: "super_admin",
      }),
    ).toThrow());
  it.each(["__proto__", "constructor", "toString"])(
    "rejects inherited object keys as actions %s",
    (action) => expect(() => parseCommunityAction({ action })).toThrow(),
  );
  it.each([
    "javascript:alert(1)",
    "http://example.com",
    "https://user:secret@example.com",
  ])("rejects unsafe evidence links %s", (url) =>
    expect(linkSchema.safeParse(url).success).toBe(false),
  );
  it("accepts an HTTPS repository reference, not a verification claim", () =>
    expect(
      parseCommunityAction({
        action: "entry-save",
        kind: "repository",
        title: "Source",
        url: "https://github.com/example/project",
      }),
    ).toMatchObject({
      aiAssisted: false,
      url: "https://github.com/example/project",
    }));
  it("rejects conflicting private scopes", () =>
    expect(() =>
      parseCommunityAction({
        action: "entry-save",
        kind: "repository",
        title: "Source",
        organizationId: id,
        projectId: id,
      }),
    ).toThrow());
  it.each(["2026-99-99", "2026-02-31"])(
    "rejects invalid calendar dates %s without throwing RangeError",
    (startDate) => {
      expect(() =>
        parseCommunityAction({
          action: "entry-save",
          kind: "experience",
          title: "Role",
          startDate,
        }),
      ).toThrowError(/date/i);
    },
  );
  it("rejects backwards experience ranges", () =>
    expect(() =>
      parseCommunityAction({
        action: "entry-save",
        kind: "experience",
        title: "Role",
        startDate: "2026-02-01",
        endDate: "2026-01-01",
      }),
    ).toThrow());
  it("deduplicates skills without making a competence judgement", () =>
    expect(
      parseCommunityAction({
        action: "profile-save",
        handle: "builder",
        displayName: "Name",
        skills: ["TypeScript", "typescript"],
      }),
    ).toMatchObject({ skills: ["typescript"] }));
  it("detects bounded actual mentions, not email addresses", () =>
    expect(
      mentionHandles("Email me@person.com or hi @Suhail (@other_dev) @suhail"),
    ).toEqual(["suhail", "other_dev"]));
  it("requires explicit boolean toggles for idempotent reactions", () =>
    expect(() =>
      parseCommunityAction({
        action: "reaction",
        targetId: id,
        targetType: "post",
        kind: "like",
      }),
    ).toThrow());
  it("prevents arbitrary avatar URLs from being published through uploads", () =>
    expect(() =>
      parseCommunityAction({
        action: "profile-save",
        handle: "builder",
        displayName: "Name",
        avatarPath: "https://example.com/not-owned.png",
      }),
    ).toThrow());
});
