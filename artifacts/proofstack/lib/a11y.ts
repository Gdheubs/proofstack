import type { KeyboardEvent } from "react";

// Keyboard support for role="tablist": arrow keys move between tabs, Home and
// End jump to the ends, and the newly selected tab receives focus. Only the
// selected tab is in the tab order (tabIndex 0); the others are reached with
// the arrow keys, as in native tab controls.
export function nextTabIndex(
  key: string,
  index: number,
  count: number,
): number | null {
  if (count <= 0) return null;
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return (index + 1) % count;
    case "ArrowLeft":
    case "ArrowUp":
      return (index - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

export function tabProps(selected: boolean) {
  return {
    role: "tab" as const,
    "aria-selected": selected,
    tabIndex: selected ? 0 : -1,
  };
}

// Attach to each tab's onKeyDown. `select` receives the index to activate;
// focus follows the selection inside the same tablist.
export function onTabKeyDown(
  event: KeyboardEvent<HTMLElement>,
  index: number,
  count: number,
  select: (next: number) => void,
) {
  const next = nextTabIndex(event.key, index, count);
  if (next === null) return;
  event.preventDefault();
  select(next);
  // Typed structurally so this file also compiles where DOM types are absent.
  const target = event.currentTarget as unknown as {
    closest(selector: string): {
      querySelectorAll(selector: string): ArrayLike<{ focus(): void }>;
    } | null;
  };
  const tabs = target
    .closest('[role="tablist"]')
    ?.querySelectorAll('[role="tab"]');
  tabs?.[next]?.focus();
}
