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
  {
    href: "/search",
    label: "Search",
    prefixes: ["/search"],
    children: [],
  },
  {
    href: "/projects",
    label: "Explore",
    prefixes: [
      "/projects",
      "/community",
      "/posts",
      "/repositories",
      "/editor",
      "/pulls",
      "/work",
      "/organizations",
      "/bookmarks",
      "/assist",
    ],
    children: [
      {
        href: "/projects",
        label: "Projects",
        description: "Discover work and build with collaborators",
      },
      {
        href: "/community",
        label: "Latest updates",
        description: "Share progress and follow what others build",
      },
      {
        href: "/repositories",
        label: "Repositories",
        description: "Code, pull requests, releases and security",
      },
      {
        href: "/editor",
        label: "Code editor",
        description: "Edit GitHub and ProofStack repositories in the browser",
      },
      {
        href: "/organizations",
        label: "Organizations",
        description: "Teams, members and shared work",
      },
      {
        href: "/bookmarks",
        label: "Bookmarks",
        description: "Return to updates you saved",
      },
      {
        href: "/assist",
        label: "Writing assist",
        description: "Draft profiles, project descriptions and documentation",
      },
    ],
  },
  {
    href: "/opportunities",
    label: "Opportunities",
    prefixes: ["/opportunities", "/career", "/applications", "/intelligence"],
    children: [
      {
        href: "/opportunities",
        label: "Opportunities",
        description: "Explore jobs and collaboration roles",
      },
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
        href: "/intelligence",
        label: "Intelligence workspace",
        description: "Explore matches and plan your next steps",
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
