import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MOBILE_TABS,
  NAV,
  PROFILE_MENU,
  getNavigationSection,
  isNavigationLinkActive,
} from "../artifacts/proofstack/lib/navigation";

const root = `${process.cwd()}/artifacts/proofstack`;

describe("workspace navigation", () => {
  it("does not render a second, competing global navigation list", () => {
    const layout = readFileSync(`${root}/app/(community)/layout.tsx`, "utf8");
    expect(layout).not.toContain("<CommunityNav");
  });

  it("offers one page per tool in the signed-in menu, with no dropdowns", () => {
    expect(NAV.map((n) => n.label)).toEqual([
      "Home",
      "Projects",
      "Code",
      "Collab",
      "Opportunities",
      "Talent",
      "Skills",
    ]);
    for (const section of NAV) expect(section.children).toEqual([]);
  });

  it("keeps personal pages in the profile menu and five tabs on phones", () => {
    expect(PROFILE_MENU.map((l) => l.href)).toEqual([
      "/profile/me",
      "/bookmarks",
      "/settings",
    ]);
    expect(MOBILE_TABS.map((t) => t.href)).toEqual([
      "/home",
      "/projects",
      "/code",
      "/opportunities",
      "/profile/me",
    ]);
  });

  it("provides a real standalone application workspace", () => {
    expect(
      existsSync(`${root}/app/(community)/opportunities/applications/page.tsx`),
    ).toBe(true);
  });

  it.each([
    ["/home", "Home"],
    ["/community", "Home"],
    ["/posts/example", "Home"],
    ["/bookmarks", "Home"],
    ["/projects/example", "Projects"],
    ["/work/example", "Projects"],
    ["/code", "Code"],
    ["/editor", "Code"],
    ["/repositories/example/security", "Code"],
    ["/pulls/example", "Code"],
    ["/organizations/example", "Collab"],
    ["/opportunities/example", "Opportunities"],
    ["/career/applications", "Opportunities"],
    ["/opportunities/hiring", "Opportunities"],
    ["/assessments/plans", "Skills"],
    ["/applications/example", "Opportunities"],
    ["/intelligence/plan/example", "Opportunities"],
    ["/talent", "Talent"],
    ["/profile/someone", "Talent"],
    ["/assessments/example", "Skills"],
  ])("assigns %s to %s only", (path, expected) => {
    expect(getNavigationSection(path)?.label).toBe(expected);
  });

  // The landing page, search, notifications and account pages sit outside the menu.
  it.each([
    "/",
    "/search",
    "/community-other",
    "/careers",
    "/profiled",
    "/account",
    "/auth",
    "/notifications",
    "/welcome",
  ])("does not highlight a group for %s", (path) => {
    expect(getNavigationSection(path)).toBeUndefined();
  });

  it.each(["/profile/me", "/profile/settings"])(
    "marks Your profile current for the self route %s (N5)",
    (path) => {
      expect(isNavigationLinkActive(path, "/profile/me")).toBe(true);
    },
  );
  it.each(["/profile/someone", "/profile/me-other", "/profile/settings-other"])(
    "keeps Talent active but Your profile not current on %s (N5)",
    (path) => {
      expect(getNavigationSection(path)?.label).toBe("Talent");
      expect(isNavigationLinkActive(path, "/profile/me")).toBe(false);
    },
  );
});

// Every App Router page must be classified: its section, or none.
const ownership: Record<string, string | undefined> = {
  "/": undefined,
  "/home": "Home",
  "/community": "Home",
  "/posts/[id]": "Home",
  "/bookmarks": "Home",
  "/projects": "Projects",
  "/projects/[slug]": "Projects",
  "/work/[id]": "Projects",
  "/code": "Code",
  "/editor": "Code",
  "/repositories": "Code",
  "/repositories/[id]": "Code",
  "/repositories/[id]/pulls": "Code",
  "/repositories/[id]/releases": "Code",
  "/repositories/[id]/security": "Code",
  "/pulls/[id]": "Code",
  "/organizations": "Collab",
  "/organizations/[slug]": "Collab",
  "/opportunities": "Opportunities",
  "/opportunities/[id]": "Opportunities",
  "/opportunities/suggested": "Opportunities",
  "/opportunities/applications": "Opportunities",
  "/opportunities/hiring": "Opportunities",
  "/career": "Opportunities",
  "/career/applications": "Opportunities",
  "/applications/[id]": "Opportunities",
  "/intelligence": "Opportunities",
  "/intelligence/[id]": "Opportunities",
  "/intelligence/plan/[id]": "Opportunities",
  "/talent": "Talent",
  "/profile/[handle]": "Talent",
  "/profile/settings": "Talent",
  "/assessments": "Skills",
  "/assessments/[id]": "Skills",
  "/assessments/results": "Skills",
  "/assessments/plans": "Skills",
  "/search": undefined,
  "/notifications": undefined,
  "/account": undefined,
  "/account/admin": undefined,
  "/account/operations": undefined,
  "/auth": undefined,
  "/welcome": undefined,
  "/foundation": undefined,
  "/design-system": undefined,
  "/about": undefined,
  "/terms": undefined,
  "/privacy": undefined,
  "/community-guidelines": undefined,
  "/contact": undefined,
  "/settings": undefined,
  "/settings/profile": undefined,
  "/settings/account": undefined,
  "/settings/security": undefined,
  "/settings/notifications": undefined,
  "/settings/career": undefined,
  "/settings/connections": undefined,
  "/settings/organizations": undefined,
  "/settings/privacy": undefined,
  "/settings/appearance": undefined,
  "/settings/admin": undefined,
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
  it("classifies every actual route pattern with no missing or stale expectations", () => {
    const routes = pageRoutes(`${root}/app`);
    expect(routes.sort()).toEqual(Object.keys(ownership).sort());
  });
  it.each(Object.entries(ownership))(
    "assigns %s to its exact section",
    (route, owner) => {
      const path = route.replace(/\[[^\]]+\]/g, "someone");
      expect(getNavigationSection(path)?.label).toBe(owner);
    },
  );
});
