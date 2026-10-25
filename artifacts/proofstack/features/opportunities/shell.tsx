"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Briefcase, Inbox, Sparkles, Users } from "lucide-react";
import { useCsrf } from "@/hooks/use-community";

// The Opportunities hub: one page per job, reached from a row of sections.
export const OPPORTUNITY_SECTIONS = [
  { href: "/opportunities", label: "Browse", icon: Briefcase },
  {
    href: "/opportunities/suggested",
    label: "Suggested for you",
    icon: Sparkles,
  },
  {
    href: "/opportunities/applications",
    label: "My applications",
    icon: Inbox,
  },
  { href: "/opportunities/hiring", label: "Hiring", icon: Users },
] as const;

export function OpportunitiesShell({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children: ReactNode;
}) {
  const path = usePathname();
  const { canAct } = useCsrf();
  return (
    <div className="space-y-6">
      <div className="rise">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">
          Opportunities
        </p>
        <h1 className="text-3xl font-semibold sm:text-4xl">{title}</h1>
        {intro && (
          <p className="mt-2 max-w-2xl text-muted-foreground">{intro}</p>
        )}
      </div>
      <nav aria-label="Opportunity sections" className="-mx-1 overflow-x-auto">
        <ul className="flex gap-1 border-b px-1">
          {OPPORTUNITY_SECTIONS.filter(
            // Private sections appear once signed in.
            (s) => canAct || s.href === "/opportunities",
          ).map(({ href, label, icon: Icon }) => {
            const active = path === href;
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm ${active ? "border-primary font-medium text-foreground dark:border-accent" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                >
                  <Icon aria-hidden="true" className="h-4 w-4" />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {children}
    </div>
  );
}
