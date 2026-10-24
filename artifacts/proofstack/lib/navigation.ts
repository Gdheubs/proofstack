export type NavigationLink = {
  href: string;
  label: string;
  description: string;
};
export type NavigationSection = {
  href: string;
  label: string;
  prefixes: string[];
  children: NavigationLink[];
};

/**
 * The signed-in workspace. Each item is one page with its own working area;
 * related pages (a project's board, a repository's pull requests) belong to
 * the same section so the header highlights where you are.
 */
export const NAV: NavigationSection[] = [
  {
    href: "/home",
    label: "Home",
    prefixes: ["/home", "/community", "/posts", "/bookmarks"],
    children: [],
  },
  {
    href: "/projects",
    label: "Projects",
    prefixes: ["/projects", "/work"],
    children: [],
  },
  {
    href: "/code",
    label: "Code",
    prefixes: ["/code", "/editor", "/repositories", "/pulls"],
    children: [],
  },
  {
    href: "/organizations",
    label: "Collab",
    prefixes: ["/organizations"],
    children: [],
  },
  {
    href: "/opportunities",
    label: "Opportunities",
    prefixes: ["/opportunities", "/career", "/applications", "/intelligence"],
    children: [],
  },
  {
    href: "/talent",
    label: "Talent",
    prefixes: ["/talent", "/profile"],
    children: [],
  },
  {
    href: "/assessments",
    label: "Skills",
    prefixes: ["/assessments"],
    children: [],
  },
];

/** Personal pages, reached from the profile picture menu. */
export const PROFILE_MENU: NavigationLink[] = [
  { href: "/profile/me", label: "Your profile", description: "" },
  { href: "/bookmarks", label: "Bookmarks", description: "" },
  { href: "/settings", label: "Settings", description: "" },
];

/** The five destinations that stay one thumb away on phones. */
export const MOBILE_TABS: { href: string; label: string }[] = [
  { href: "/home", label: "Home" },
  { href: "/projects", label: "Projects" },
  { href: "/code", label: "Code" },
  { href: "/opportunities", label: "Jobs" },
  { href: "/profile/me", label: "Profile" },
];

export function pathMatches(path: string, prefix: string) {
  return path === prefix || (prefix !== "/" && path.startsWith(prefix + "/"));
}

export function getNavigationSection(path: string) {
  return NAV.find((section) =>
    section.prefixes.some((prefix) => pathMatches(path, prefix)),
  );
}

export function isNavigationLinkActive(path: string, href: string) {
  // More-specific siblings win: application pages aren't career preferences.
  if (href === "/career") return path === href;
  // Talent owns all profiles, but another person's page is not "Your profile".
  if (href === "/profile/me")
    return path === "/profile/me" || path === "/profile/settings";
  return pathMatches(path, href);
}
