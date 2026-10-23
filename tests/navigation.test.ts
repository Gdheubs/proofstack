import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  NAV,
  getNavigationSection,
  isNavigationLinkActive,
} from "../artifacts/proofstack/lib/navigation";

const root = `${process.cwd()}/artifacts/proofstack`;

describe("workspace navigation", () => {
  it("does not render a second, competing global navigation list", () => {
    const layout = readFileSync(`${root}/app/(community)/layout.tsx`, "utf8");
    expect(layout).not.toContain("<CommunityNav");
  });

  it("offers Search, Explore, Opportunities and Talent as the main menu", () => {
    expect(NAV.map((n) => n.label)).toEqual([
      "Search",
      "Explore",
      "Opportunities",
      "Talent",
    ]);
    expect(NAV.find((n) => n.label === "Talent")?.children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ href: "/talent" }),
        expect.objectContaining({ href: "/assessments" }),
        expect.objectContaining({ href: "/profile/me" }),
      ]),
    );
  });

  it("does not put the same tool in multiple groups", () => {
    const destinations = NAV.flatMap((n) => n.children.map((c) => c.href));
    expect(new Set(destinations).size).toBe(destinations.length);
  });

  it("provides a real standalone application workspace", () => {
    expect(
      existsSync(`${root}/app/(community)/career/applications/page.tsx`),
    ).toBe(true);
  });

  it("describes the existing profile, project and documentation writing tasks (N10)", () => {
    const assist = NAV.flatMap((section) => section.children).find(
      (child) => child.href === "/assist",
    );
    expect(assist?.description).toMatch(/profile/i);
    expect(assist?.description).toMatch(/project/i);
    expect(assist?.description).toMatch(/documentation/i);
    expect(assist?.description).not.toMatch(/post|update/i);
  });

  it.each([
    ["/projects/example", "Explore"],
    ["/repositories/example/security", "Explore"],
    ["/pulls/example", "Explore"],
    ["/work/example", "Explore"],
    ["/organizations/example", "Explore"],
    ["/search", "Search"],
    ["/assist", "Explore"],
    ["/talent", "Talent"],
    ["/profile/someone", "Talent"],
    ["/assessments/example", "Talent"],
    ["/career/applications", "Opportunities"],
    ["/opportunities/example", "Opportunities"],
    ["/applications/example", "Opportunities"],
    ["/intelligence/plan/example", "Opportunities"],
    ["/community", "Explore"],
    ["/posts/example", "Explore"],
    ["/bookmarks", "Explore"],
  ])("assigns %s to %s only", (path, expected) => {
    const section = getNavigationSection(path);
    expect(section?.label).toBe(expected);
    if (section?.children.length) {
      expect(
        section.children.filter((link) =>
          isNavigationLinkActive(path, link.href),
        ),
      ).toHaveLength(path === "/profile/someone" ? 0 : 1);
    }
  });

  // Notifications live behind the header bell, outside every menu group.
  it.each([
    "/community-other",
    "/careers",
    "/profiled",
    "/account",
    "/auth",
    "/notifications",
  ])("does not highlight an unrelated group for %s", (path) => {
    expect(getNavigationSection(path)).toBeUndefined();
  });

  it.each(["/profile/me", "/profile/settings"])(
    "marks My profile current for the self route %s (N5)",
    (path) => {
      expect(isNavigationLinkActive(path, "/profile/me")).toBe(true);
    },
  );
  it.each(["/profile/someone", "/profile/me-other", "/profile/settings-other"])(
    "keeps Talent active but no personal child current on %s (N5)",
    (path) => {
      const section = getNavigationSection(path);
      expect(section?.label).toBe("Talent");
      expect(
        section?.children.filter((link) =>
          isNavigationLinkActive(path, link.href),
        ),
      ).toEqual([]);
    },
  );
});

// Every App Router page must be classified. Another person's profile intentionally
// belongs to Talent without claiming that the viewer's My profile page is current.
const ownership: Record<string, [string | undefined, string | undefined]> = {
  "/": [undefined, undefined],
  "/projects": ["Explore", "/projects"],
  "/projects/[slug]": ["Explore", "/projects"],
  "/work/[id]": ["Explore", "/projects"],
  "/repositories": ["Explore", "/repositories"],
  "/repositories/[id]": ["Explore", "/repositories"],
  "/repositories/[id]/pulls": ["Explore", "/repositories"],
  "/repositories/[id]/releases": ["Explore", "/repositories"],
  "/repositories/[id]/security": ["Explore", "/repositories"],
  "/pulls/[id]": ["Explore", "/repositories"],
  "/organizations": ["Explore", "/organizations"],
  "/organizations/[slug]": ["Explore", "/organizations"],
  "/search": ["Search", undefined],
  "/assist": ["Explore", "/assist"],
  "/talent": ["Talent", "/talent"],
  "/assessments": ["Talent", "/assessments"],
  "/assessments/[id]": ["Talent", "/assessments"],
  "/profile/[handle]": ["Talent", undefined],
  "/profile/settings": ["Talent", "/profile/me"],
  "/career": ["Opportunities", "/career"],
  "/career/applications": ["Opportunities", "/career/applications"],
  "/applications/[id]": ["Opportunities", "/career/applications"],
  "/opportunities": ["Opportunities", "/opportunities"],
  "/opportunities/[id]": ["Opportunities", "/opportunities"],
  "/intelligence": ["Opportunities", "/intelligence"],
  "/intelligence/[id]": ["Opportunities", "/intelligence"],
  "/intelligence/plan/[id]": ["Opportunities", "/intelligence"],
  "/community": ["Explore", "/community"],
  "/posts/[id]": ["Explore", "/community"],
  "/bookmarks": ["Explore", "/bookmarks"],
  "/notifications": [undefined, undefined],
  "/account": [undefined, undefined],
  "/account/admin": [undefined, undefined],
  "/account/operations": [undefined, undefined],
  "/auth": [undefined, undefined],
  "/foundation": [undefined, undefined],
  "/design-system": [undefined, undefined],
  "/about": [undefined, undefined],
  "/terms": [undefined, undefined],
  "/privacy": [undefined, undefined],
  "/community-guidelines": [undefined, undefined],
  "/contact": [undefined, undefined],
  "/editor": ["Explore", "/editor"],
};
function pageRoutes(directory: string, segments: string[] = []): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory())
      return pageRoutes(
        `${directory}/${entry.name}`,
        entry.name.startsWith("(") ? segments : [...segments, entry.name],
      );
    return entry.name === "page.tsx" ? ["/" + segments.join("/")] : [];
  });
}
describe("complete App Router navigation inventory", () => {
  it("classifies all 43 actual route patterns with no missing or stale expectations", () => {
    const routes = pageRoutes(`${root}/app`);
    expect(routes).toHaveLength(43);
    expect(routes.sort()).toEqual(Object.keys(ownership).sort());
  });
  it.each(Object.entries(ownership))(
    "assigns %s to its exact section and intended current child",
    (route, [owner, child]) => {
      const path = route.replace(/\[[^\]]+\]/g, "someone");
      const section = getNavigationSection(path);
      expect(section?.label).toBe(owner);
      expect(
        section?.children
          .filter((link) => isNavigationLinkActive(path, link.href))
          .map((link) => link.href) ?? [],
      ).toEqual(child ? [child] : []);
    },
  );
  it("resolves every primary child href to an implemented page", () => {
    const patterns = pageRoutes(`${root}/app`).map((route) => route.split("/"));
    for (const child of NAV.flatMap((section) => section.children)) {
      const segments = child.href.split("/");
      expect(
        patterns.some(
          (pattern) =>
            pattern.length === segments.length &&
            pattern.every(
              (segment, i) =>
                /^\[[^\]]+\]$/.test(segment) || segment === segments[i],
            ),
        ),
        child.href,
      ).toBe(true);
    }
  });
});
