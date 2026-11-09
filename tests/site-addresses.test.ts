import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RESERVED_HANDLES } from "../artifacts/api-server/src/services/community-input";
import { SITE_SEGMENTS } from "../artifacts/proofstack/lib/navigation";

// Repositories live at /<handle>/<name>: every page folder at the top of the
// site must be reserved as a handle and known to the navigation.
function topLevel(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("["))
    .flatMap((e) =>
      e.name.startsWith("(") ? topLevel(`${dir}/${e.name}`) : [e.name],
    );
}

describe("site addresses and usernames", () => {
  const pages = topLevel(`${process.cwd()}/artifacts/proofstack/app`);
  it("reserves every top-level page as a handle", () => {
    expect(pages.length).toBeGreaterThan(20);
    for (const page of [...pages, "api", "runner"])
      expect(RESERVED_HANDLES, page).toContain(page);
  });
  it("keeps top-level pages out of the repository section", () => {
    for (const page of [...pages, "api", "runner"])
      expect(SITE_SEGMENTS.has(page), page).toBe(true);
  });
});
