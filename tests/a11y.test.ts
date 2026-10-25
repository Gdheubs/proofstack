import { describe, expect, it } from "vitest";
import { nextTabIndex, tabProps } from "../artifacts/proofstack/lib/a11y";

describe("tablist keyboard support", () => {
  it("moves with arrows, wraps at the ends, and jumps with Home and End", () => {
    expect(nextTabIndex("ArrowRight", 0, 3)).toBe(1);
    expect(nextTabIndex("ArrowRight", 2, 3)).toBe(0);
    expect(nextTabIndex("ArrowLeft", 0, 3)).toBe(2);
    expect(nextTabIndex("ArrowDown", 1, 3)).toBe(2);
    expect(nextTabIndex("ArrowUp", 1, 3)).toBe(0);
    expect(nextTabIndex("Home", 2, 3)).toBe(0);
    expect(nextTabIndex("End", 0, 3)).toBe(2);
  });
  it("ignores other keys and empty lists", () => {
    expect(nextTabIndex("Enter", 0, 3)).toBeNull();
    expect(nextTabIndex("a", 0, 3)).toBeNull();
    expect(nextTabIndex("ArrowRight", 0, 0)).toBeNull();
  });
  it("keeps only the selected tab in the tab order", () => {
    expect(tabProps(true)).toEqual({
      role: "tab",
      "aria-selected": true,
      tabIndex: 0,
    });
    expect(tabProps(false).tabIndex).toBe(-1);
  });
});
