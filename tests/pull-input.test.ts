import { execFileSync } from "node:child_process";
import { describe, it, expect } from "vitest";
import { branchSchema } from "../artifacts/api-server/src/services/repository-input";
import {
  pullInput,
  releaseTag,
} from "../artifacts/api-server/src/services/pull-input";
const id = "550e8400-e29b-41d4-a716-446655440000",
  head = "a".repeat(40);
describe("Pull request action boundaries", () => {
  it("rejects client-forged check outcomes, identities and status bypasses", () => {
    expect(() =>
      pullInput({
        action: "check",
        id,
        sourceHead: head,
        targetHead: head,
        status: "passed",
      }),
    ).toThrow();
    expect(() =>
      pullInput({
        action: "review",
        id,
        sourceHead: head,
        targetHead: head,
        decision: "approved",
        body: "",
        reviewerId: id,
      }),
    ).toThrow();
    expect(() =>
      pullInput({ action: "state", id, status: "merged" }),
    ).toThrow();
  });
  it("requires exact immutable commit identifiers", () => {
    expect(() =>
      pullInput({ action: "merge", id, sourceHead: "main", targetHead: head }),
    ).toThrow();
  });
  it("accepts only release tags compatible with Git ref synchronization", () => {
    const longestTag = "v1.2.3-" + "a".repeat(73);
    expect(longestTag).toHaveLength(80);
    const release = (tag: string) => ({
      action: "release",
      repositoryId: id,
      commit: head,
      tag,
      title: "Version release",
      notes: "",
    });
    for (const tag of [
      "v1.0.0-rc.lock",
      "1.0.0-rc.1.lock",
      "v1.0.0-lock.lock",
      longestTag + "a",
    ]) {
      expect(branchSchema.safeParse(tag).success, tag).toBe(false);
      expect(releaseTag.safeParse(tag).success, tag).toBe(false);
      expect(() => pullInput(release(tag)), tag).toThrow();
    }
    for (const tag of [
      "v1.2.3",
      "1.2.3",
      "v1.2.3-rc.1",
      "v1.2.3-rc-lock",
      "v1.2.3-rc.lock.1",
      "v1.2.3-rc.LOCK",
      longestTag,
    ]) {
      expect(releaseTag.parse(tag)).toBe(tag);
      expect(pullInput(release(tag))).toMatchObject({ tag });
      expect(branchSchema.parse(tag)).toBe(tag);
      expect(() =>
        execFileSync("git", ["check-ref-format", "refs/tags/" + tag]),
      ).not.toThrow();
    }
  });
  it("rejects unsafe release refs and accepts version tags", () => {
    for (const tag of ["refs/heads/main", "../v1", "--help", "v1.0.0.lock"])
      expect(releaseTag.safeParse(tag).success).toBe(false);
    expect(releaseTag.safeParse("v1.2.3-rc.1").success).toBe(true);
  });
});
