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

/** Each tool has one home. Desktop and mobile use this same hierarchy. */
export const NAV: NavigationSection[] = [
  { href: "/", label: "Overview", prefixes: ["/"], children: [] },
  {
    href: "/projects",
    label: "Community",
    prefixes: [
      "/projects",
      "/repositories",
      "/pulls",
      "/work",
      "/organizations",
      "/search",
      "/assist",
    ],
    children: [
      {
        href: "/projects",
        label: "Projects",
        description: "Discover work and build with collaborators",
      },
      {
        href: "/repositories",
        label: "Repositories",
        description: "Code, pull requests, releases and security",
      },
      {
        href: "/organizations",
        label: "Organizations",
        description: "Teams, members and shared work",
      },
      {
        href: "/search",
        label: "Search community",
        description: "Find people, projects and updates",
      },
      {
        href: "/assist",
        label: "Writing assist",
        description: "Draft profiles, project descriptions and documentation",
      },
    ],
  },
  {
    href: "/talent",
    label: "Talent",
    prefixes: ["/talent", "/assessments", "/profile"],
    children: [
      {
        href: "/talent",
        label: "Talent directory",
        description: "Discover builders and their evidence",
      },
      {
        href: "/assessments",
        label: "Skill checks",
        description: "Take a platform test and see your results",
      },
      {
        href: "/profile/me",
        label: "My profile",
        description: "Your projects, experience and skill results",
      },
    ],
  },
  {
    href: "/career",
    label: "Career workspace",
    prefixes: ["/career", "/opportunities", "/applications", "/intelligence"],
    children: [
      {
        href: "/career",
        label: "Career preferences",
        description: "Manage availability, evidence and hiring",
      },
      {
        href: "/career/applications",
        label: "Applications & hiring inbox",
        description: "Track applications and conversations",
      },
      {
        href: "/opportunities",
        label: "Opportunities",
        description: "Explore jobs and collaboration roles",
      },
      {
        href: "/intelligence",
        label: "Intelligence workspace",
        description: "Explore matches and plan your next steps",
      },
    ],
  },
  {
    href: "/community",
    label: "Build log",
    prefixes: ["/community", "/posts", "/bookmarks"],
    children: [
      {
        href: "/community",
        label: "Latest updates",
        description: "Share progress and follow what others build",
      },
      {
        href: "/bookmarks",
        label: "Bookmarks",
        description: "Return to updates you saved",
      },
    ],
  },
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
  // Talent owns all profiles, but another person's page is not "My profile".
  if (href === "/profile/me")
    return path === "/profile/me" || path === "/profile/settings";
  if (href === "/repositories" && pathMatches(path, "/pulls")) return true;
  if (href === "/projects" && pathMatches(path, "/work")) return true;
  if (href === "/career/applications" && pathMatches(path, "/applications"))
    return true;
  if (href === "/community" && pathMatches(path, "/posts")) return true;
  return pathMatches(path, href);
}
