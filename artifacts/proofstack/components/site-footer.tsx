"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/logo";
import { isExamPath } from "@/lib/chrome";
import { internalPagesHidden } from "@/lib/internal-pages";
import { LEGAL_LINKS } from "@/features/legal/legal-page";
import { OPERATOR } from "@/lib/legal";

// Reads the address in the browser, like the header and the bottom tabs, so
// all three leave an exam page together.
export function SiteFooter() {
  const path = usePathname();
  if (isExamPath(path)) return null;
  return (
    <footer className="border-t">
      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-10 sm:grid-cols-2 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-sm text-muted-foreground">
            A home for your projects, your collaborators, and your next
            opportunity.
          </p>
        </div>
        <nav aria-label="Pages" className="flex flex-col gap-2 text-sm">
          <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Pages
          </span>
          <Link className="hover:underline" href="/">
            Overview
          </Link>
          <Link className="hover:underline" href="/opportunities">
            Opportunities
          </Link>
          <Link className="hover:underline" href="/talent">
            Talent directory
          </Link>
        </nav>
        <div className="flex flex-col gap-2 text-sm">
          <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Resources
          </span>
          <Link className="hover:underline" href="/assessments">
            Skill checks
          </Link>
          <Link className="hover:underline" href="/about">
            About
          </Link>
          {!internalPagesHidden() && (
            <>
              <Link className="hover:underline" href="/foundation">
                System status
              </Link>
              <Link className="hover:underline" href="/design-system">
                Design system
              </Link>
            </>
          )}
        </div>
        <nav aria-label="Legal" className="flex flex-col gap-2 text-sm">
          <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Legal
          </span>
          {LEGAL_LINKS.map((link) => (
            <Link key={link.href} className="hover:underline" href={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
      {/* The year can differ between the server and a browser at New Year. */}
      <p
        suppressHydrationWarning
        className="mx-auto max-w-6xl px-5 pb-8 text-xs text-muted-foreground"
      >
        © {new Date().getFullYear()} {OPERATOR.brand}. Grievance Officer:{" "}
        {OPERATOR.grievanceOfficer}, {OPERATOR.grievanceEmail}.
      </p>
    </footer>
  );
}
