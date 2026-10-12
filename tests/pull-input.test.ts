import { describe, it, expect } from "vitest";
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
  it("rejects unsafe release refs and accepts version tags", () => {
    for (const tag of ["refs/heads/main", "../v1", "--help", "v1.0.0.lock"])
      expect(releaseTag.safeParse(tag).success).toBe(false);
    expect(releaseTag.safeParse("v1.2.3-rc.1").success).toBe(true);
  });
});
