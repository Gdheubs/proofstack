"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  getGetCommunityQueryKey,
  useGetCommunity,
} from "@workspace/api-client-react";
import { useCsrf } from "@/hooks/use-community";

const LINKS = [
  { href: "/repositories", label: "Repositories" },
  { href: "/opportunities", label: "Opportunities" },
  { href: "/talent", label: "Talent" },
  { href: "/career", label: "Career workspace" },
  { href: "/community", label: "Build log" },
  { href: "/projects", label: "Projects" },
  { href: "/organizations", label: "Organizations" },
  { href: "/search", label: "Search" },
  { href: "/bookmarks", label: "Bookmarks" },
  { href: "/notifications", label: "Notifications" },
  { href: "/assist", label: "Assist" },
  { href: "/profile/me", label: "My profile" },
];

export function CommunityNav() {
  const path = usePathname();
  const { canAct } = useCsrf();
  const params = { view: "notifications" } as const;
  const n = useGetCommunity(params, {
    query: {
      queryKey: getGetCommunityQueryKey(params),
      enabled: canAct,
      staleTime: 30_000,
      retry: false,
    },
  });
  const unread = n.data?.unreadCount ?? 0;
  return (
    <nav aria-label="Community" className="border-b bg-card/50">
      <ul className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-5 py-2">
        {LINKS.map((l) => {
          const active =
            l.href === "/profile/me"
              ? path.startsWith("/profile")
              : path === l.href ||
                path.startsWith(l.href + "/") ||
                (l.href === "/community" && path.startsWith("/posts"));
          return (
            <li key={l.href} className="shrink-0">
              <Link
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
              >
                {l.label}
                {l.href === "/notifications" && unread > 0 && (
                  <span className="rounded-full bg-accent px-1.5 font-mono text-[10px] text-accent-foreground">
                    {unread}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
