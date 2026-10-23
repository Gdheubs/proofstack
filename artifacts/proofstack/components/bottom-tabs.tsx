"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Briefcase, Code2, FolderKanban, Home, User } from "lucide-react";
import { useSession } from "@/hooks/use-auth";
import {
  MOBILE_TABS,
  isNavigationLinkActive,
  pathMatches,
} from "@/lib/navigation";

const ICONS: Record<string, typeof Home> = {
  "/home": Home,
  "/projects": FolderKanban,
  "/code": Code2,
  "/opportunities": Briefcase,
  "/profile/me": User,
};

// Phone navigation for signed-in members: five destinations within thumb
// reach. The spacer keeps page content from hiding behind the bar.
export function BottomTabs() {
  const path = usePathname();
  const session = useSession();
  if (!session.data?.authenticated) return null;
  const active = (href: string) =>
    href === "/profile/me"
      ? isNavigationLinkActive(path, href)
      : pathMatches(path, href);
  return (
    <>
      <div aria-hidden="true" className="h-16 lg:hidden" />
      <nav
        aria-label="Quick navigation"
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <ul className="grid h-16 grid-cols-5">
          {MOBILE_TABS.map((tab) => {
            const Icon = ICONS[tab.href] ?? Home;
            const current = active(tab.href);
            return (
              <li key={tab.href}>
                <Link
                  href={tab.href}
                  aria-current={current ? "page" : undefined}
                  className={`flex h-full flex-col items-center justify-center gap-1 text-[11px] focus-visible:outline-2 focus-visible:outline-ring ${current ? "text-primary dark:text-accent" : "text-muted-foreground"}`}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
