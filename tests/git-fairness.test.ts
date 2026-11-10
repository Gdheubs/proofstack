import { describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", () => ({ pool: { query: vi.fn() } }));

const { ANONYMOUS_PACK_SLOTS, PACK_SLOTS, claimPackSlot } =
  await import("../artifacts/api-server/src/routes/repositories");

describe("Git clone fairness", () => {
  it("never lets anonymous clones take every packing slot", () => {
    const anonymous = Array.from({ length: ANONYMOUS_PACK_SLOTS }, () =>
      claimPackSlot(false),
    );
    expect(anonymous.every(Boolean)).toBe(true);
    expect(claimPackSlot(false)).toBe(false);
    const members = Array.from(
      { length: PACK_SLOTS - ANONYMOUS_PACK_SLOTS },
      () => claimPackSlot(true),
    );
    expect(members.every(Boolean)).toBe(true);
    expect(claimPackSlot(true)).toBe(false);
    // Releasing (even twice) frees exactly one slot.
    const first = anonymous[0] as () => void;
    first();
    first();
    expect(claimPackSlot(true)).not.toBe(false);
    expect(claimPackSlot(true)).toBe(false);
  });
});
